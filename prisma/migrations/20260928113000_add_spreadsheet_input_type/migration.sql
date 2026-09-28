-- Add a dedicated source type for workbook and CSV evidence. Financial files retain
-- their source provenance but are processed through a spreadsheet-aware path.
ALTER TYPE "InputType" ADD VALUE IF NOT EXISTS 'SPREADSHEET';
