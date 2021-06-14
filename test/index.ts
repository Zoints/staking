import { Token, TOKEN_PROGRAM_ID, MintLayout } from '@solana/spl-token';
import {
    BPF_LOADER_PROGRAM_ID,
    BpfLoader,
    Keypair,
    LAMPORTS_PER_SOL,
    Transaction,
    PublicKey,
    SystemProgram
} from '@solana/web3.js';
import { Connection } from '@solana/web3.js';
import * as fs from 'fs';
import { sendAndConfirmTransaction } from './util';
import {
    Staking,
    Initialize,
    RegisterCommunity,
    InitializeStake,
    Stake
} from '../js/src/index';

const config = {
    funder: new Keypair(),
    deploy_key: new Keypair(),

    authority: new Keypair(),

    mint_id: new Keypair(),
    mint_authority: new Keypair(),

    user_community: [
        {
            authority: new Keypair(),
            community: new Keypair()
        }
    ],

    zoints_community: [
        {
            authority: new Keypair(),
            community: new Keypair(),
            primary: new Keypair()
        }
    ],

    staker: [new Keypair()]
};

const connection = new Connection('http://localhost:8899');
const programId = config.deploy_key.publicKey;

const token = new Token(
    connection,
    config.mint_id.publicKey,
    TOKEN_PROGRAM_ID,
    config.funder
);

const staking = new Staking(programId, connection);

(async () => {
    console.log(`Funding ${config.funder.publicKey.toBase58()} with 20 SOL`);
    let sig = await connection.requestAirdrop(
        config.funder.publicKey,
        20 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig);

    console.log(`Deploy BPF to ${programId.toBase58()}`);
    const programdata = fs.readFileSync('../program/target/deploy/staking.so');
    if (
        !(await BpfLoader.load(
            connection,
            config.funder,
            config.deploy_key,
            programdata,
            BPF_LOADER_PROGRAM_ID
        ))
    ) {
        console.log('Loading bpf failed');
        process.exit(1);
    }

    console.log(
        `Creating new SPL Token ${config.mint_id.publicKey.toBase58()}`
    );

    // doing it manually since the library doesn't accept pre-defined pubkeys
    const balanceNeeded = await Token.getMinBalanceRentForExemptMint(
        connection
    );

    const transaction = new Transaction();
    transaction.add(
        SystemProgram.createAccount({
            fromPubkey: config.funder.publicKey,
            newAccountPubkey: config.mint_id.publicKey,
            lamports: balanceNeeded,
            space: MintLayout.span,
            programId: TOKEN_PROGRAM_ID
        })
    );

    transaction.add(
        Token.createInitMintInstruction(
            TOKEN_PROGRAM_ID,
            config.mint_id.publicKey,
            0,
            config.mint_authority.publicKey,
            null
        )
    );

    await sendAndConfirmTransaction(connection, transaction, [
        config.funder,
        config.mint_id
    ]);

    console.log(`Attempting to initialize`);

    const reward_pool_id = (
        await PublicKey.findProgramAddress(
            [Buffer.from('rewardpool')],
            programId
        )
    )[0];

    const init_trans = new Transaction().add(
        await Initialize(
            programId,
            config.funder.publicKey,
            config.authority.publicKey,
            config.mint_id.publicKey
        )
    );

    const init_sig = await sendAndConfirmTransaction(connection, init_trans, [
        config.funder,
        config.authority
    ]);
    console.log(`Initialized: ${init_sig}`);

    const settings = await staking.getSettings();
    console.log(`Settings account: ${settings}`);

    await token.mintTo(reward_pool_id, config.mint_authority, [], 100_000_000);

    //////////
    ////////// USER COMMUNITY 1
    //////////

    const user_1 = config.user_community[0].authority;
    const user_1_community = config.user_community[0].community;
    const user_1_primary = new Keypair();

    const user_1_trans = new Transaction().add(
        await RegisterCommunity(
            programId,
            config.funder.publicKey,
            user_1.publicKey,
            user_1_community.publicKey,
            user_1_primary.publicKey
        )
    );
    sendAndConfirmTransaction(connection, user_1_trans, [
        config.funder,
        user_1,
        user_1_community
    ])
        .then((sig) => console.log(`User 1 community registered: ${sig}`))
        .catch((e) => console.log(e));

    //////////
    ////////// ZOINTS COMMUNITY 1
    //////////

    const zoints_1 = config.zoints_community[0].authority;
    const zoints_1_community = config.zoints_community[0].community;
    const zoints_1_primary = config.zoints_community[0].primary;

    const zoints_1_trans = new Transaction().add(
        await RegisterCommunity(
            programId,
            config.funder.publicKey,
            zoints_1.publicKey,
            zoints_1_community.publicKey,
            zoints_1_primary.publicKey,
            zoints_1.publicKey
        )
    );
    sendAndConfirmTransaction(connection, zoints_1_trans, [
        config.funder,
        zoints_1,
        zoints_1_community
    ])
        .then((sig) => console.log(`Zoints 1 community registered: ${sig}`))
        .catch((e) => console.log(e));

    //////////
    ////////// STAKER 1
    //////////
    const staker_1 = config.staker[0];
    const staker_1_associated = await token.getOrCreateAssociatedAccountInfo(
        staker_1.publicKey
    );

    const staker_1_trans = new Transaction().add(
        await InitializeStake(
            programId,
            config.funder.publicKey,
            staker_1.publicKey,
            user_1_community.publicKey
        )
    );
    const staker_1_sig = await sendAndConfirmTransaction(
        connection,
        staker_1_trans,
        [config.funder, staker_1]
    );
    console.log(`Staker_1/user_community_1 stake created: ${staker_1_sig}`);

    await token.mintTo(
        staker_1_associated.address,
        config.mint_authority,
        [],
        20_000
    );

    //////////
    ////////// ADD STAKE
    //////////

    const stake_1_trans = new Transaction().add(
        await Stake(
            programId,
            config.funder.publicKey,
            staker_1.publicKey,
            staker_1_associated.address,
            user_1_community.publicKey,
            20_000
        )
    );

    const stake_1_sig = await sendAndConfirmTransaction(
        connection,
        stake_1_trans,
        [config.funder, staker_1]
    );
    console.log(`user1/comm1 Staked 20,000 ZEE: ${stake_1_sig}`);
})();
