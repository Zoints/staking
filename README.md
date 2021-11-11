
## Running Tests

Install JavaScript dependencies:

```bash
cd js
npm i
npm run build
cd ../test_server
npm i
```

Build Solana program:

```bash
cd ../program
cargo build-bpf
```

Start Solana node and interactive web server:

```bash
cd ../test_server
docker-compose up -d

npm run start
```