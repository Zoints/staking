import { MintLayout, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
    BpfLoader,
    BPF_LOADER_PROGRAM_ID,
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    sendAndConfirmTransaction,
    SystemProgram,
    Transaction
} from '@solana/web3.js';
import { createHmac } from 'crypto';
import * as fs from 'fs';
import { Initialize, InitializeStake, Staking } from '../../js/src';
import { sleep } from './util';
import * as crypto from 'crypto';

export class Stake {
    seedPath: string;
    bpfPath: string;
    loaded: boolean;

    seed: Buffer;
    newSeed: boolean;

    connection: Connection;
    staking: Staking;

    funder: Keypair;
    deploy_key: Keypair;
    program_id: PublicKey;

    authority: Keypair;

    mint_id: Keypair;
    mint_authority: Keypair;

    constructor(url: string, bpfPath: string, seedPath: string) {
        this.seedPath = seedPath;
        this.bpfPath = bpfPath;
        this.loaded = false;

        this.connection = new Connection(url);
        this.newSeed = false;
        this.seed = this.loadSeed();

        this.funder = this.getKeyPair('funder');
        this.deploy_key = this.getKeyPair('deployKey');
        this.program_id = this.deploy_key.publicKey;
        this.authority = this.getKeyPair('authority');

        this.mint_id = this.getKeyPair('mint');
        this.mint_authority = this.getKeyPair('mintAuthority');

        this.staking = new Staking(this.program_id, this.connection);

        console.log(`    Funder: ${this.funder.publicKey.toBase58()}`);
        console.log(`Program ID: ${this.program_id.toBase58()}`);
    }

    loadSeed(): Buffer {
        try {
            const seedRaw = fs.readFileSync(this.seedPath);
            const seed = Buffer.from(seedRaw.toString(), 'hex');

            console.log(`Loading existing seed: ${seed.toString('hex')}`);
            return seed;
        } catch (e) {
            const seed = crypto.randomBytes(16);
            console.log(`Generating new seed: ${seed.toString('hex')}`);

            fs.writeFileSync(this.seedPath, seed.toString('hex'), {});
            this.newSeed = true;
            return seed;
        }
    }

    async regenerate() {
        this.loaded = false;
        console.log(`Reloading BPF`);
        this.seed = crypto.randomBytes(16);
        fs.writeFileSync(this.seedPath, this.seed.toString('hex'), {});
        this.newSeed = true;

        this.funder = this.getKeyPair('funder');
        this.deploy_key = this.getKeyPair('deployKey');
        this.program_id = this.deploy_key.publicKey;
        this.authority = this.getKeyPair('authority');

        this.mint_id = this.getKeyPair('mint');
        this.mint_authority = this.getKeyPair('mintAuthority');

        this.staking = new Staking(this.program_id, this.connection);

        console.log(`    Funder: ${this.funder.publicKey.toBase58()}`);
        console.log(`Program ID: ${this.program_id.toBase58()}`);

        await this.setup();
    }

    private getKeyPair(name: string): Keypair {
        const hash = createHmac('sha256', this.seed).update(name).digest();
        return Keypair.fromSeed(hash);
    }

    public async setup() {
        if (this.newSeed) {
            console.log(`New BPF: initializing program...`);
            await this.fund();
            await this.loadBPF();
            await this.initializeProgram();
            console.log(`Initialization done.`);
        }
        this.loaded = true;
    }

    private async fund() {
        console.log(`Funding funder with 100 SOL`);
        let sig = await this.connection.requestAirdrop(
            this.funder.publicKey,
            100 * LAMPORTS_PER_SOL
        );
        await this.connection.confirmTransaction(sig);
        console.log(`Funded: ${sig}`);
    }

    private async loadBPF() {
        console.log(`Deploying BPF`);
        const programdata = fs.readFileSync(this.bpfPath);
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

        while (true) {
            const acc = await this.connection.getAccountInfo(this.program_id);
            if (acc === null || !acc.executable) {
                sleep(500);
                continue;
            }

            break;
        }
    }

    private async initializeProgram() {
        // Token library doesn't accept tokens with pre-defined mint for some reason
        const balanceNeeded = await Token.getMinBalanceRentForExemptMint(
            this.connection
        );

        const transaction = new Transaction()
            .add(
                SystemProgram.createAccount({
                    fromPubkey: this.funder.publicKey,
                    newAccountPubkey: this.mint_id.publicKey,
                    lamports: balanceNeeded,
                    space: MintLayout.span,
                    programId: TOKEN_PROGRAM_ID
                })
            )
            .add(
                Token.createInitMintInstruction(
                    TOKEN_PROGRAM_ID,
                    this.mint_id.publicKey,
                    0,
                    this.mint_authority.publicKey,
                    null
                )
            )
            .add(
                await Initialize(
                    this.program_id,
                    this.funder.publicKey,
                    this.authority.publicKey,
                    this.mint_id.publicKey
                )
            );
        const sig = await sendAndConfirmTransaction(
            this.connection,
            transaction,
            [this.funder, this.mint_id, this.authority]
        );
        console.log(`Initialized: ${sig}`);
    }
}
