# Historical data layer

This directory documents the shape of the stored analytical dataset. The production app should query a database rather than download market data when a user presses Scan.

Recommended analytical row:

`symbol, year, month, monthStartClose, monthEndClose, returnPct`

The ingestion job will populate/update this dataset from the selected market-data provider. API credentials must be stored as deployment secrets, never in this repository.
