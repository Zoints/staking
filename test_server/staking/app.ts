import {
    BpfLoader,
    BPF_LOADER_PROGRAM_ID,
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey
} from '@solana/web3.js';
import * as fs from 'fs';

export class Stake {
    connection: Connection;

    funder: Keypair;
    deploy_key: Keypair;
    program_id: PublicKey;

    authority: Keypair;

    mint_id: Keypair;
    mint_authority: Keypair;

    constructor(url: string) {
        this.connection = new Connection(url);

        this.funder = new Keypair();
        this.deploy_key = new Keypair();
        this.program_id = this.deploy_key.publicKey;
        this.authority = new Keypair();

        this.mint_id = new Keypair();
        this.mint_authority = new Keypair();

        console.log(`Funder: ${this.funder.publicKey.toBase58()}`);
        console.log(`Program ID: ${this.program_id.toBase58()}`);
    }

    public async fund() {
        console.log(`Funding funder with 100 SOL`);
        let sig = await this.connection.requestAirdrop(
            this.funder.publicKey,
            100 * LAMPORTS_PER_SOL
        );
        await this.connection.confirmTransaction(sig);
    }

    public async loadBPF(path: string) {
        console.log(`Deploying BPF`);
        const programdata = fs.readFileSync(path);
        if (
            !(await BpfLoader.load(
                this.connection,
                this.funder,
                this.deploy_key,
                programdata,
                BPF_LOADER_PROGRAM_ID
            ))
        ) {
            console.log('Loading bpf failed');
            process.exit(1);
        }
    }

    public async initializeContract() {}
}
