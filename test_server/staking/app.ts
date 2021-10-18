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
import { Authority, Instruction, Staking } from '@zoints/staking';
import { seededKey, sleep } from './util';
import * as crypto from 'crypto';
import { StakeEngine } from './engine';

export class App {
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

    mint_id: Keypair;
    mint_authority: Keypair;

    endpoints: Keypair[];
    wallets: Keypair[];
    nfts: Keypair[];

    engine: StakeEngine;

    constructor(
        url: string,
        bpfPath: string,
        seedPath: string,
        engine: StakeEngine
    ) {
        this.seedPath = seedPath;
        this.bpfPath = bpfPath;
        this.loaded = false;

        this.connectionURL = url;
        this.connection = new Connection(url, 'confirmed');
        this.newSeed = false;
        this.seed = this.loadSeed();

        this.funder = this.getKeyPair('funder');
        this.deploy_key = this.getKeyPair('deployKey');
        this.program_id = this.deploy_key.publicKey;

        this.mint_id = this.getKeyPair('mint');
        this.mint_authority = this.getKeyPair('mintAuthority');

        this.staking = new Staking(this.program_id, this.connection);
        this.token = new Token(
            this.connection,
            this.mint_id.publicKey,
            TOKEN_PROGRAM_ID,
            this.funder
        );

        this.endpoints = [];
        this.wallets = [];
        this.nfts = [];

        this.engine = engine;

        this.print_config();
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

    print_config() {
        const early = new Keypair();
        console.log(`#### .env file for backend dev ####
###################################
STAKING_ENABLED=true
STAKING_PROGRAM_ID=${this.program_id.toBase58()}
ZEE_MINT=${this.mint_id.publicKey.toBase58()}
FUNDER_PUBKEY=${this.funder.publicKey.toBase58()}
FUNDER_SECRET=${Buffer.from(this.funder.secretKey).toString('hex')}
ZCARDS_PROGRAM_ID=11111111111111111111111111111111
EARLY_ADOPTERS_PUBKEY=${early.publicKey.toBase58()}
EARLY_ADOPTERS_SECRET=${Buffer.from(early.secretKey).toString('hex')}
###################################
#### FAUCET information
MINT=${Buffer.from(this.mint_id.secretKey).toString(
            'hex'
        )} MINT_AUTHORITY=${Buffer.from(this.mint_authority.secretKey).toString(
            'hex'
        )} FUNDER=${Buffer.from(this.funder.secretKey).toString('hex')}
`);
    }

    private getKeyPair(name: string): Keypair {
        return seededKey(name, this.seed);
    }

    public async airdrop(id: number, amount: number): Promise<void> {
        const assoc = await this.token.getOrCreateAssociatedAccountInfo(
            this.wallets[id].publicKey
        );
        return this.token.mintTo(
            assoc.address,
            this.mint_authority,
            [],
            amount
        );
    }

    public async claimStaker(stakerId: number): Promise<string> {
        const staker = this.stakers[stakerId];

        const communities = [];
        for (const comm of this.communities) {
            try {
                const stake = await this.staking.getStakeWithoutId(
                    comm.publicKey,
                    staker.publicKey
                );
                if (
                    stake.unbondingAmount.gtn(0) &&
                    stake.unbondingEnd.valueOf() <= new Date().valueOf()
                ) {
                    communities.push(comm);
                }
            } catch (e) {}
            if (communities.length >= 6) break;
        }

        await this.engine.claim(this, staker, communities);
        return 'removed with engine';
    }

    public async stake(
        commId: number,
        stakerId: number,
        amount: number
    ): Promise<string> {
        const community = this.communities[commId];
        const staker = this.stakers[stakerId];

        await this.engine.stake(this, community, staker, BigInt(amount));

        return 'removed with engine';
    }

    public async withdrawUnbond(
        commId: number,
        stakerId: number
    ): Promise<string> {
        const community = this.communities[commId];
        const staker = this.stakers[stakerId];
        await this.engine.withdraw(this, staker, [community]);
        return 'removed with engine';
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

    async addEndpoint(primary: Authority, secondary: Authority) {
        const id = this.endpoints.length;
        const key = this.getKeyPair(`endpoint-${id}`);
        this.endpoints.push(key);

        const promises: Promise<void>[] = [
            new Promise((resolve, reject) => {
                this.engine
                    .registerCommunity(this, community, noSecondary)
                    .then(() => {
                        resolve();
                    })
                    .catch((r) => reject(r));
            }),
            new Promise((resolve, reject) => {
                this.token
                    .getOrCreateAssociatedAccountInfo(
                        community.primaryAuthority.publicKey
                    )
                    .then(() => {
                        resolve();
                    })
                    .catch((r) => reject(r));
            })
        ];

        if (!noSecondary) {
            promises.push(
                new Promise((resolve, reject) => {
                    this.token
                        .getOrCreateAssociatedAccountInfo(
                            community.secondaryAuthority.publicKey
                        )
                        .then(() => {
                            resolve();
                        })
                        .catch((r) => reject(r));
                })
            );
        }

        await Promise.all(promises);
    }

    async addWallet() {
        const id = this.wallets.length;
        const key = this.getKeyPair(`wallet-${id}`);
        this.wallets.push(key);
        console.log(`Added wallet ${id}: ${key.publicKey.toBase58()}`);
        await this.token.getOrCreateAssociatedAccountInfo(key.publicKey);
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

        let date = new Date();
        //date.setMinutes(date.getMinutes() + 3);

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
                await Instruction.Initialize(
                    this.program_id,
                    this.funder.publicKey,
                    this.mint_id.publicKey,
                    date,
                    60
                )
            );
        const sig = await sendAndConfirmTransaction(
            this.connection,
            transaction,
            [this.funder, this.mint_id]
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
