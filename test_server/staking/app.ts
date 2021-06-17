import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    MintLayout,
    Token,
    TOKEN_PROGRAM_ID
} from '@solana/spl-token';
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
import * as fs from 'fs';
import {
    Initialize,
    InitializeStake,
    RegisterCommunity,
    Staking,
    Stake as StakeInstruction
} from '../../js/src';
import { seededKey, sleep } from './util';
import * as crypto from 'crypto';
import { AppCommunity, AppStaker } from './community';

export class Stake {
    seedPath: string;
    bpfPath: string;
    loaded: boolean;

    seed: Buffer;
    newSeed: boolean;

    connection: Connection;
    connectionURL: string;
    staking: Staking;
    token: Token;

    funder: Keypair;
    deploy_key: Keypair;
    program_id: PublicKey;

    authority: Keypair;

    mint_id: Keypair;
    mint_authority: Keypair;

    communities: AppCommunity[];
    stakers: AppStaker[];

    constructor(url: string, bpfPath: string, seedPath: string) {
        this.seedPath = seedPath;
        this.bpfPath = bpfPath;
        this.loaded = false;

        this.connectionURL = url;
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
        this.token = new Token(
            this.connection,
            this.mint_id.publicKey,
            TOKEN_PROGRAM_ID,
            this.funder
        );

        this.communities = [];
        this.stakers = [];

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

        this.seed = crypto.randomBytes(16);
        console.log(`Reloading BPF with new seed ${this.seed.toString('hex')}`);
        fs.writeFileSync(this.seedPath, this.seed.toString('hex'), {});
        this.newSeed = true;

        this.funder = this.getKeyPair('funder');
        this.deploy_key = this.getKeyPair('deployKey');
        this.program_id = this.deploy_key.publicKey;
        this.authority = this.getKeyPair('authority');

        this.mint_id = this.getKeyPair('mint');
        this.mint_authority = this.getKeyPair('mintAuthority');

        this.staking = new Staking(this.program_id, this.connection);
        this.token = new Token(
            this.connection,
            this.mint_id.publicKey,
            TOKEN_PROGRAM_ID,
            this.funder
        );

        this.communities = [];
        this.stakers = [];

        console.log(`    Funder: ${this.funder.publicKey.toBase58()}`);
        console.log(`Program ID: ${this.program_id.toBase58()}`);

        await this.setup();
    }

    private getKeyPair(name: string): Keypair {
        return seededKey(name, this.seed);
    }

    public async airdrop(id: number, amount: number): Promise<void> {
        const assoc = await this.token.getOrCreateAssociatedAccountInfo(
            this.stakers[id].key.publicKey
        );
        return this.token.mintTo(
            assoc.address,
            this.mint_authority,
            [],
            amount
        );
    }

    public async stake(
        commId: number,
        stakerId: number,
        amount: number
    ): Promise<void> {
        const community = this.communities[commId];
        const staker = this.stakers[stakerId];
        const assoc = await this.token.getOrCreateAssociatedAccountInfo(
            staker.key.publicKey
        );
        const trans = new Transaction();

        try {
            await this.staking.getStaker(
                community.key.publicKey,
                staker.key.publicKey
            );
        } catch (e) {
            trans.add(
                await InitializeStake(
                    this.program_id,
                    this.funder.publicKey,
                    staker.key.publicKey,
                    community.key.publicKey
                )
            );
        }

        trans.add(
            await StakeInstruction(
                this.program_id,
                this.funder.publicKey,
                staker.key.publicKey,
                assoc.address,
                community.key.publicKey,
                amount
            )
        );
        const sig = await sendAndConfirmTransaction(this.connection, trans, [
            this.funder,
            staker.key
        ]);

        console.log(`Staked: ${sig}`);
    }

    public async setup() {
        if (!this.newSeed) {
            // check if bpf is loaded
            let acc = await this.connection.getAccountInfo(this.program_id);
            if (acc === null) {
                this.loaded = false;
                console.log(
                    `Seed file found but program not loaded. Reloading BPF with original seed ${this.seed.toString(
                        'hex'
                    )}`
                );
                this.newSeed = true;
            } else if (acc.executable === false) {
                this.loaded = false;
                this.seed = crypto.randomBytes(16);
                fs.writeFileSync(this.seedPath, this.seed.toString('hex'), {});
                console.log(
                    `Seed file found but program loaded incorrect. Reloading BPF with new seed ${this.seed.toString(
                        'hex'
                    )}`
                );
                this.newSeed = true;
            }
        }

        if (this.newSeed) {
            console.log(`New BPF: initializing program...`);
            await this.fund();
            await this.loadBPF();
            await this.initializeProgram();
            console.log(`Initialization done.`);
        } else {
            for (let i = 0; ; i++) {
                const comm = new AppCommunity(i, this.seed);
                const acc = await this.connection.getAccountInfo(
                    comm.key.publicKey
                );
                if (acc === null) break;
                this.communities.push(comm);
            }

            for (let i = 0; ; i++) {
                const staker = new AppStaker(i, this.seed);
                const address = await Token.getAssociatedTokenAddress(
                    ASSOCIATED_TOKEN_PROGRAM_ID,
                    TOKEN_PROGRAM_ID,
                    this.mint_id.publicKey,
                    staker.key.publicKey
                );
                const acc = await this.connection.getAccountInfo(address);
                if (acc === null) break;
                this.stakers.push(staker);
            }
        }
        this.loaded = true;
    }

    async addCommunity() {
        const comm = new AppCommunity(this.communities.length, this.seed);
        this.communities.push(comm);

        const transaction = new Transaction().add(
            await RegisterCommunity(
                this.program_id,
                this.funder.publicKey,
                comm.authority.publicKey,
                comm.key.publicKey,
                comm.primaryAuthority.publicKey,
                comm.secondaryAuthority.publicKey
            )
        );

        const sig = await sendAndConfirmTransaction(
            this.connection,
            transaction,
            [this.funder, comm.authority, comm.key]
        );
        console.log(
            `Added community ${
                comm.id
            }: ${comm.key.publicKey.toBase58()}: ${sig}`
        );
    }

    async addStaker() {
        const staker = new AppStaker(this.stakers.length, this.seed);
        this.stakers.push(staker);
        console.log(
            `Adding staker ${staker.id}: ${staker.key.publicKey.toBase58()}`
        );

        await this.token.getOrCreateAssociatedAccountInfo(staker.key.publicKey);
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

    async loadBPF() {
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

        const rewardPool = await this.staking.rewardPoolId();
        await this.token.mintTo(
            rewardPool,
            this.mint_authority,
            [],
            1_000_000_000
        );

        console.log(`Token minted and 1_000_000_000 ZEE created`);
    }
}
