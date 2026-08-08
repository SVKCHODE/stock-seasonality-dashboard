-- Analytical table used by the seasonality scanner.
CREATE TABLE IF NOT EXISTS monthly_returns (
  symbol TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  month_start_close NUMERIC,
  month_end_close NUMERIC,
  return_pct NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (symbol, year, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_returns_month_year
  ON monthly_returns (month, year);

CREATE INDEX IF NOT EXISTS idx_monthly_returns_symbol
  ON monthly_returns (symbol);
