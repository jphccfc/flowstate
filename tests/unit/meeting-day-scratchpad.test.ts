import { describe, expect, it } from "vitest";
import { parseInlineTags, mergeManualTags } from "../../lib/scratchpad/tags";
describe("meeting day scratchpad inline tags",()=>{
 it("parses slash and hashtag forms",()=>{ expect(parseInlineTags("/John Horseman/ /Finance/ note")).toEqual({stakeholder:"John Horseman",domain:"Finance"}); expect(parseInlineTags("#John Horseman #Finance note")).toEqual({stakeholder:"John Horseman",domain:"Finance"}); });
 it("prefers manual tags",()=>{ expect(mergeManualTags({stakeholder:"John Horseman",domain:"Finance"},{stakeholder:"AI Person",domain:"Operations"})).toEqual({stakeholder:"John Horseman",domain:"Finance"}); });
});
