import { prisma } from "@/lib/db";
import { segmentText } from "@/lib/ai/segmenting";
import { generateTagSuggestions, type TaggableEntity } from "@/lib/ai/tagging";
import { generateDocumentFinding, normaliseForMatch } from "@/lib/ai/document-findings";
import { classifyDocumentDomain, type DomainClassification } from "@/lib/ai/document-domains";
import { transcribeAudio } from "@/lib/ai/transcription";
import { generateFollowUpSuggestions } from "@/lib/ai/followups";

const AUTO_APPROVE_THRESHOLD = 0.85;

export async function processCapturedInput(capturedInputId: string): Promise<void> {
  const input = await prisma.capturedInput.findUniqueOrThrow({
    where: { id: capturedInputId },
  });

  try {
    let rawText = input.rawText;

    if (rawText == null) {
      if (!input.sourceRef) {
        throw new Error("CapturedInput has no rawText and no sourceRef to transcribe/extract from");
      }

      rawText = await runJob("transcribe", capturedInputId, async () => {
        await prisma.capturedInput.update({
          where: { id: capturedInputId },
          data: { status: "TRANSCRIBING" },
        });

        const text =
          input.type === "AUDIO"
            ? await transcribeAudio(input.sourceRef!)
            : await (await import("@/lib/documents/extraction")).extractDocumentText(input.sourceRef!);

        await prisma.capturedInput.update({
          where: { id: capturedInputId },
          data: { rawText: text, status: "TRANSCRIBED" },
        });

        return text;
      });
    }

    const segments = await runJob("segment", capturedInputId, async () => {
      await prisma.capturedInput.update({
        where: { id: capturedInputId },
        data: { status: "SEGMENTING" },
      });

      const rawSegments = segmentText(rawText ?? "");
      return Promise.all(
        rawSegments.map((s) =>
          prisma.capturedSegment.create({
            data: { capturedInputId, order: s.order, text: s.text },
          })
        )
      );
    });

    let documentDomain: DomainClassification | null = null;
    let documentCapabilityIds = new Set<string>();
    if (input.type === "DOCUMENT") {
      const attachment = await prisma.capturedInputAttachment.findFirst({ where: { capturedInputId }, select: { filename: true } });
      const domains = await prisma.businessDomain.findMany({ where: { organizationId: input.organizationId }, include: { capabilities: true } });
      documentDomain = await classifyDocumentDomain({
        documentName: attachment?.filename ?? "document",
        sourcePath: input.sourceRef,
        text: rawText ?? "",
        domains: domains.map((domain) => ({ domainId: domain.id, name: domain.name, description: domain.description })),
      });
      if (documentDomain) {
        documentCapabilityIds = new Set(domains.find((domain) => domain.id === documentDomain?.domainId)?.capabilities.map((capability) => capability.id) ?? []);
      }
    }

    await runJob("tag", capturedInputId, async () => {
      await prisma.capturedInput.update({
        where: { id: capturedInputId },
        data: { status: "TAGGING" },
      });

      const candidates = await getTaggableEntities(input.organizationId);
      const tagCandidates = input.type === "DOCUMENT"
        ? candidates.filter((candidate) => candidate.targetType !== "CAPABILITY" || documentCapabilityIds.has(candidate.targetId))
        : candidates;

      for (const segment of segments) {
        const suggestions = await generateTagSuggestions(segment.text, tagCandidates);
        for (const suggestion of suggestions) {
          await prisma.tag.create({
            data: {
              segmentId: segment.id,
              targetType: suggestion.targetType,
              targetId: suggestion.targetId,
              confidence: suggestion.confidence,
              status:
                suggestion.confidence >= AUTO_APPROVE_THRESHOLD
                  ? "AUTO_APPROVED"
                  : "PENDING_REVIEW",
            },
          });
        }
      }
    });

    if (input.type === "DOCUMENT") {
      await runJob("finding", capturedInputId, async () => {
        const attachment = await prisma.capturedInputAttachment.findFirst({
          where: { capturedInputId },
          select: { filename: true },
        });
        const capabilities = (await getTaggableEntities(input.organizationId)).filter(
          (entity) => entity.targetType === "CAPABILITY" && (!documentDomain || documentCapabilityIds.has(entity.targetId)),
        );
        const draft = await generateDocumentFinding({
          documentName: attachment?.filename ?? "document",
          sourcePath: input.sourceRef,
          domainId: documentDomain?.domainId ?? null,
          domainName: documentDomain?.domainName ?? null,
          text: rawText ?? "",
          capabilities: capabilities.map((entity) => ({
            capabilityId: entity.targetId,
            name: entity.name,
          })),
        });
        // No verified citation means no finding. An uncited claim is an opinion,
        // and this pipeline must not present opinions as evidence.
        if (!draft) return;

        // Link each verified excerpt back to the segment it came from, so the
        // review UI can highlight the passage in the document.
        const citedSegmentIds = segments
          .filter((segment) => {
            const haystack = normaliseForMatch(segment.text);
            return draft.citedExcerpts.some((excerpt) => haystack.includes(normaliseForMatch(excerpt)));
          })
          .map((segment) => segment.id);

        // Only unresolved findings are replaced. A human's approve or reject is a
        // decision, not a cache entry: re-analysis must never silently discard it.
        await prisma.documentFinding.deleteMany({
          where: { capturedInputId, status: "PENDING_REVIEW" },
        });

        await prisma.documentFinding.create({
          data: {
            organizationId: input.organizationId,
            capturedInputId,
            documentFamilyId: input.documentFamilyId,
            documentType: draft.documentType,
            title: draft.title,
            summary: draft.summary,
            capabilityId: draft.capabilityId,
            capabilityName: draft.capabilityName,
            domainId: draft.domainId,
            domainName: draft.domainName,
            evidenceDemonstrated: draft.evidenceDemonstrated,
            strength: draft.strength,
            confidence: draft.confidence,
            citedSegmentIds,
            citedExcerpts: draft.citedExcerpts,
            status: "PENDING_REVIEW",
            // The idempotency key embeds the drive item and content hash, so it
            // changes exactly when the source content changes — which is the
            // property staleness detection needs.
            sourceHash: input.sourceHash ?? null,
          },
        });

        // A later version of the same source supersedes this finding. Marking it
        // STALE is what stops an old approval from reading as current.
        if (input.sourceRef) {
          const superseded = await prisma.capturedInput.findMany({
            where: { organizationId: input.organizationId, sourceRef: input.sourceRef, id: { not: capturedInputId } },
            select: { id: true },
          });
          if (superseded.length > 0) {
            await prisma.documentFinding.updateMany({
              where: { capturedInputId: { in: superseded.map((row) => row.id) }, status: { not: "STALE" } },
              data: { status: "STALE" },
            });
          }
        }
      });
    }

    if (input.sessionId) {
      const sessionId = input.sessionId;
      await runJob("suggest_followups", capturedInputId, async () => {
        const latestSegment = segments[segments.length - 1];
        if (!latestSegment) return;

        const touchedAreaNames = await getTouchedAreaNames(sessionId);
        const questions = await generateFollowUpSuggestions(latestSegment.text, touchedAreaNames);

        for (const question of questions) {
          await prisma.followUpSuggestion.create({
            data: {
              sessionId,
              triggerSegmentId: latestSegment.id,
              suggestedQuestion: question,
              status: "SHOWN",
            },
          });
        }
      }).catch((err) => {
        console.error("suggest_followups step failed (non-fatal):", err);
      });
    }

    await prisma.capturedInput.update({
      where: { id: capturedInputId },
      data: { status: "TAGGED" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.capturedInput.update({
      where: { id: capturedInputId },
      data: { status: "FAILED", error: message },
    });
    throw err;
  }
}

async function runJob<T>(
  type: string,
  targetId: string,
  fn: () => Promise<T>
): Promise<T> {
  const job = await prisma.processingJob.create({
    data: { type, targetId, status: "RUNNING", attempts: 1 },
  });
  try {
    const result = await fn();
    await prisma.processingJob.update({
      where: { id: job.id },
      data: { status: "DONE" },
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.processingJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: message },
    });
    throw err;
  }
}

async function getTaggableEntities(organizationId: string): Promise<TaggableEntity[]> {
  const [domains, kpis, stakeholders] = await Promise.all([
    prisma.businessDomain.findMany({
      where: { organizationId },
      include: { capabilities: true },
    }),
    prisma.kPI.findMany({ where: { organizationId } }),
    prisma.stakeholder.findMany({ where: { organizationId } }),
  ]);

  const entities: TaggableEntity[] = [];
  for (const domain of domains) {
    entities.push({ targetType: "DOMAIN", targetId: domain.id, name: domain.name });
    for (const capability of domain.capabilities) {
      entities.push({ targetType: "CAPABILITY", targetId: capability.id, name: capability.name });
    }
  }
  for (const kpi of kpis) {
    entities.push({ targetType: "KPI", targetId: kpi.id, name: kpi.name });
  }
  for (const stakeholder of stakeholders) {
    entities.push({ targetType: "STAKEHOLDER", targetId: stakeholder.id, name: stakeholder.name });
  }
  return entities;
}

async function getTouchedAreaNames(sessionId: string): Promise<string[]> {
  const tags = await prisma.tag.findMany({
    where: {
      status: { in: ["AUTO_APPROVED", "APPROVED"] },
      segment: { capturedInput: { sessionId } },
    },
  });

  if (tags.length === 0) return [];

  const idsByType = new Map<string, string[]>();
  for (const tag of tags) {
    const ids = idsByType.get(tag.targetType) ?? [];
    ids.push(tag.targetId);
    idsByType.set(tag.targetType, ids);
  }

  const [domains, capabilities, kpis, stakeholders] = await Promise.all([
    prisma.businessDomain.findMany({ where: { id: { in: idsByType.get("DOMAIN") ?? [] } } }),
    prisma.capability.findMany({ where: { id: { in: idsByType.get("CAPABILITY") ?? [] } } }),
    prisma.kPI.findMany({ where: { id: { in: idsByType.get("KPI") ?? [] } } }),
    prisma.stakeholder.findMany({ where: { id: { in: idsByType.get("STAKEHOLDER") ?? [] } } }),
  ]);

  const names = [
    ...domains.map((d) => d.name),
    ...capabilities.map((c) => c.name),
    ...kpis.map((k) => k.name),
    ...stakeholders.map((s) => s.name),
  ];

  return Array.from(new Set(names));
}
