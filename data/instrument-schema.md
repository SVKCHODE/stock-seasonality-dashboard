# Instrument universe

The scanner needs a stable list of NSE equity symbols mapped to the market-data provider's instrument key.

Recommended fields:

- `symbol` — NSE trading symbol shown to the user
- `instrument_key` — provider-specific identifier used for historical requests
- `name` — company name
- `universe` — e.g. Nifty 50, Nifty 200, Nifty 500, NSE listed
- `active` — whether the instrument is currently included

The ingestion job should refresh this mapping independently from price history so delisted/renamed instruments can be handled without corrupting historical calculations.
