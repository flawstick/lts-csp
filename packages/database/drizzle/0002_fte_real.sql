-- Change FTE columns from integer to real (decimal) to support fractional values
ALTER TABLE "lts_substance_form" ALTER COLUMN "total_fte" TYPE real USING "total_fte"::real;
ALTER TABLE "lts_substance_form" ALTER COLUMN "total_qualified_fte" TYPE real USING "total_qualified_fte"::real;
