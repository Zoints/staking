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
    Authority,
    AuthorityType,
    Instruction,
    Staking
} from '@zoints/staking';
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

    public async claimWallet(walletId: number): Promise<void> {
        const wallet = this.wallets[walletId];

        const endpoints = [];
        for (const ep of this.endpoints) {
            try {
                const stake = await this.staking.getStakeWithoutId(
                    ep.publicKey,
                    wallet.publicKey
                );
                if (
                    stake.unbondingAmount.gtn(0) &&
                    stake.unbondingEnd.valueOf() <= new Date().valueOf()
                ) {
                    endpoints.push(ep.publicKey);
                }
            } catch (e) {}
            if (endpoints.length >= 6) break;
        }

        await this.engine.claim(this, wallet, endpoints);
    }

    public async stake(
        endpoint: number,
        wallet: number,
        amount: number
    ): Promise<void> {
        await this.engine.stake(
            this,
            this.endpoints[endpoint].publicKey,
            this.wallets[wallet],
            BigInt(amount)
        );
    }

    public async withdrawUnbond(
        endpoint: number,
        wallet: number
    ): Promise<void> {
        await this.engine.withdraw(this, this.wallets[wallet], [
            this.endpoints[endpoint].publicKey
        ]);
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
            // autodetect accounts

            // wallets
            for (let i = 0; ; i++) {
                const wallet = this.getKeyPair(`wallet-${i}`);
                const assoc = await Token.getAssociatedTokenAddress(
                    ASSOCIATED_TOKEN_PROGRAM_ID,
                    TOKEN_PROGRAM_ID,
                    this.mint_id.publicKey,
                    wallet.publicKey
                );
                const acc = await this.connection.getAccountInfo(assoc);
                if (acc === null) break;
                this.wallets.push(wallet);
            }

            // endpoints
            for (let i = 0; ; i++) {
                const endpoint = this.getKeyPair(`endpoint-${i}`);
                const acc = await this.connection.getAccountInfo(
                    endpoint.publicKey
                );
                if (acc === null) break;
                this.endpoints.push(endpoint);
            }

            // nfts
            for (let i = 0; ; i++) {
                const nft = this.getKeyPair(`nft-${i}`);
                const acc = await this.connection.getAccountInfo(nft.publicKey);
                if (acc === null) break;
                this.nfts.push(nft);
            }
        }
        this.loaded = true;
    }

    async addEndpoint(
        authorityType: AuthorityType,
        owner: number,
        primary: number,
        secondary: number
    ) {
        const id = this.endpoints.length;
        const key = this.getKeyPair(`endpoint-${id}`);
        this.endpoints.push(key);

        const address =
            authorityType == AuthorityType.NFT
                ? this.nfts[owner].publicKey
                : this.wallets[owner].publicKey;

        const authority = new Authority({
            authorityType,
            address
        });

        let sec = PublicKey.default;
        if (secondary >= 0) {
            sec = this.wallets[secondary].publicKey;
        }

        await this.engine.registerEndpoint(
            this,
            key,
            authority,
            this.wallets[primary].publicKey,
            sec
        );

        return id;
    }

    async addWallet() {
        const id = this.wallets.length;
        const key = this.getKeyPair(`wallet-${id}`);
        this.wallets.push(key);
        await this.token.getOrCreateAssociatedAccountInfo(key.publicKey);
        console.log(`Added wallet ${id}: ${key.publicKey.toBase58()}`);

        return id;
    }

    async addNFT(wallet: number) {
        const recipient = this.wallets[wallet];

        const id = this.nfts.length;
        const mint = this.getKeyPair(`nft-${id}`);
        const authority = this.getKeyPair(`nft-${id}-authority`);

        this.nfts.push(mint);

        const balanceNeeded = await Token.getMinBalanceRentForExemptMint(
            this.connection
        );

        const assoc = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            mint.publicKey,
            recipient.publicKey,
            true
        );

        const tx = new Transaction();
        tx.add(
            SystemProgram.createAccount({
                fromPubkey: this.funder.publicKey,
                newAccountPubkey: mint.publicKey,
                lamports: balanceNeeded,
                space: MintLayout.span,
                programId: TOKEN_PROGRAM_ID
            }),
            Token.createInitMintInstruction(
                TOKEN_PROGRAM_ID,
                mint.publicKey,
                0,
                authority.publicKey,
                null
            ),
            Token.createAssociatedTokenAccountInstruction(
                ASSOCIATED_TOKEN_PROGRAM_ID,
                TOKEN_PROGRAM_ID,
                mint.publicKey,
                assoc,
                recipient.publicKey,
                this.funder.publicKey
            ),
            Token.createMintToInstruction(
                TOKEN_PROGRAM_ID,
                mint.publicKey,
                assoc,
                authority.publicKey,
                [],
                1
            ),
            Token.createSetAuthorityInstruction(
                TOKEN_PROGRAM_ID,
                mint.publicKey,
                null,
                'MintTokens',
                authority.publicKey,
                []
            )
        );

        await sendAndConfirmTransaction(this.connection, tx, [
            this.funder,
            authority,
            mint
        ]);

        console.log(`Added NFT ${mint.publicKey.toBase58()}`);
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

    async getEndpointOwnerAndOwnerSigner(
        id: number
    ): Promise<{ owner: PublicKey; ownerSigner: Keypair }> {
        const pubkey = this.endpoints[id].publicKey;
        const endpoint = await this.staking.getEndpoint(pubkey);

        if (endpoint.owner.authorityType == AuthorityType.Basic) {
            for (let id = 0; id < this.wallets.length; id++) {
                if (this.wallets[id].publicKey.equals(endpoint.owner.address)) {
                    return {
                        owner: this.wallets[id].publicKey,
                        ownerSigner: this.wallets[id]
                    };
                }
            }
        } else if (endpoint.owner.authorityType == AuthorityType.NFT) {
            for (let id = 0; id < this.nfts.length; id++) {
                if (this.nfts[id].publicKey.equals(endpoint.owner.address)) {
                    const ownerSigner =
                        this.wallets[await this.getNFTOwner(id)];
                    return {
                        owner: await Token.getAssociatedTokenAddress(
                            ASSOCIATED_TOKEN_PROGRAM_ID,
                            TOKEN_PROGRAM_ID,
                            this.nfts[id].publicKey,
                            ownerSigner.publicKey,
                            true
                        ),
                        ownerSigner
                    };
                }
            }
        }

        throw new Error('invalid endpoint data');
    }

    async getNFTOwner(id: number): Promise<number> {
        const nft = this.nfts[id];
        const accs = await this.connection.getTokenLargestAccounts(
            nft.publicKey
        );
        for (const acc of accs.value) {
            if (acc.amount == '1') {
                const token = new Token(
                    this.connection,
                    nft.publicKey,
                    TOKEN_PROGRAM_ID,
                    new Keypair()
                );
                const assoc = await token.getAccountInfo(acc.address);
                for (let id = 0; id < this.wallets.length; id++) {
                    if (this.wallets[id].publicKey.equals(assoc.owner)) {
                        return id;
                    }
                }
            }
        }
        return -1;
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
            1_000_000_000_000
        );

        console.log(`Token minted and 1_000_000_000_000 ZEE created`);
    }
}
