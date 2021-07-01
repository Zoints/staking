# Interactive Test Server

Needs a running solana local node to start.

## Seed

To facilitate dev work, the test server uses keys derived from a seed file, which is persisted as `seed.json`. If the seed file exists, it will check to see if the program is loaded and if it is, it will try and re-derive all existing communities and accounts.

To force the server to reload the BPF, delete `seed.json`.

## Running (With Backend)

By default, the test server requires backend to run on port :8080 in order to function. Steps:

1. Start the solana node
2. Start the test server via `npm run start`
3. Copy the console output for the `.env` file into the backend's `.env` file
4. Start the backend
5. Wait for the test server to finish loading the BPF/Initialize if necessary

## Running (Without Backend)

To develop against just a solana node, run the test server with environment variable `ENGINE=direct`: `ENGINE=direct npm run start`