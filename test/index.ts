import {
    Token,
    TOKEN_PROGRAM_ID,
    MintLayout,
    ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import {
    BPF_LOADER_PROGRAM_ID,
    BpfLoader,
    Keypair,
    LAMPORTS_PER_SOL,
    Transaction,
    TransactionInstruction,
    AccountMeta,
    PublicKey,
    SYSVAR_RENT_PUBKEY,
    SystemProgram,
    SYSVAR_CLOCK_PUBKEY
} from '@solana/web3.js';
import { Connection } from '@solana/web3.js';
import * as fs from 'fs';
import * as borsh from 'borsh';
import { Initialize, RegisterCommunity, Stake } from './instructions';
import { sendAndConfirmTransaction } from './util';

const zeroKey = new PublicKey(Buffer.alloc(0, 32));

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

function am(
    pubkey: PublicKey,
    isSigner: boolean,
    isWritable: boolean
): AccountMeta {
    return { pubkey, isSigner, isWritable };
}

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

    const init_instruction = new Initialize();
    const init_data = Buffer.alloc(1, 0);

    const settings_id = (
        await PublicKey.findProgramAddress([Buffer.from('settings')], programId)
    )[0];
    const stake_pool_id = (
        await PublicKey.findProgramAddress(
            [Buffer.from('stakepool')],
            programId
        )
    )[0];

    const reward_fund_id = (
        await PublicKey.findProgramAddress(
            [Buffer.from('rewardfund')],
            programId
        )
    )[0];

    /*
        let funder_info = next_account_info(iter)?;
        let authority_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let stake_pool_info = next_account_info(iter)?;
        let reward_fund_info = next_account_info(iter)?;
        let token_info = next_account_info(iter)?;
        let rent_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;
        let token_program_info = next_account_info(iter)?;
        let program_info = next_account_info(iter)?;
        */

    const init_keys: AccountMeta[] = [
        am(config.funder.publicKey, true, false),
        am(config.authority.publicKey, true, false),
        am(settings_id, false, true),
        am(stake_pool_id, false, true),
        am(reward_fund_id, false, true),
        am(config.mint_id.publicKey, false, false),
        am(SYSVAR_RENT_PUBKEY, false, false),
        am(SYSVAR_CLOCK_PUBKEY, false, false),
        am(TOKEN_PROGRAM_ID, false, false),
        am(programId, false, false),
        am(SystemProgram.programId, false, false)
    ];

    const init_trans = new Transaction().add(
        new TransactionInstruction({
            keys: init_keys,
            programId,
            data: init_data
        })
    );

    const init_sig = await sendAndConfirmTransaction(connection, init_trans, [
        config.funder,
        config.authority
    ]);
    console.log(`Initialized: ${init_sig}`);

    await token.mintTo(reward_fund_id, config.mint_authority, [], 100_000_000);

    //////////
    ////////// USER COMMUNITY 1
    //////////

    const user_1 = config.user_community[0].authority;
    const user_1_community = config.user_community[0].community;

    const user_1_assoc = await token.getOrCreateAssociatedAccountInfo(
        user_1.publicKey
    );
    await token.mintTo(user_1_assoc.address, config.mint_authority, [], 20_000);

    const user_1_instruction = new RegisterCommunity();
    const user_1_data = borsh.serialize(
        RegisterCommunity.schema,
        user_1_instruction
    );

    const user_1_primary = new Keypair();
    const user_1_primary_assoc = await token.getOrCreateAssociatedAccountInfo(
        user_1_primary.publicKey
    );
    const user_1_referrer = new Keypair();

    /*
        let iter = &mut accounts.iter();
        let funder_info = next_account_info(iter)?;
        let creator_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let community_info = next_account_info(iter)?;
        let primary_info = next_account_info(iter)?;
        let primary_associated_info = next_account_info(iter)?;
        let secondary_info = next_account_info(iter)?;
        let secondary_associated_info = next_account_info(iter)?;
        let rent_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;
        */

    const user_1_keys: AccountMeta[] = [
        am(config.funder.publicKey, true, false),
        am(user_1.publicKey, true, false),
        am(settings_id, false, false),
        am(user_1_community.publicKey, true, true),
        am(user_1_primary.publicKey, false, false),
        am(user_1_primary_assoc.address, false, true),
        am(zeroKey, false, false),
        am(zeroKey, false, false),
        am(SYSVAR_RENT_PUBKEY, false, false),
        am(SYSVAR_CLOCK_PUBKEY, false, false),
        am(SystemProgram.programId, false, false)
    ];

    const user_1_trans = new Transaction().add(
        new TransactionInstruction({
            keys: user_1_keys,
            programId,
            data: Buffer.from(user_1_data)
        })
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

    const zoints_1_assoc = await token.getOrCreateAssociatedAccountInfo(
        zoints_1.publicKey
    );
    await token.mintTo(
        zoints_1_assoc.address,
        config.mint_authority,
        [],
        20_000
    );

    const zoints_1_instruction = new RegisterCommunity();
    const zoints_1_data = borsh.serialize(
        RegisterCommunity.schema,
        zoints_1_instruction
    );

    const zoints_1_primary = config.zoints_community[0].primary;
    const zoints_1_primary_assoc = await token.getOrCreateAssociatedAccountInfo(
        zoints_1_primary.publicKey
    );

    /*
        let iter = &mut accounts.iter();
        let funder_info = next_account_info(iter)?;
        let creator_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let community_info = next_account_info(iter)?;
        let primary_info = next_account_info(iter)?;
        let primary_associated_info = next_account_info(iter)?;
        let secondary_info = next_account_info(iter)?;
        let secondary_associated_info = next_account_info(iter)?;
        let rent_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;
        */
    const zoints_1_keys: AccountMeta[] = [
        am(config.funder.publicKey, true, false),
        am(zoints_1.publicKey, true, false),
        am(settings_id, false, false),
        am(zoints_1_community.publicKey, true, true),
        am(zoints_1_primary.publicKey, false, false),
        am(zoints_1_primary_assoc.address, false, true),
        am(zoints_1.publicKey, false, false),
        am(zoints_1_assoc.address, false, false),
        am(SYSVAR_RENT_PUBKEY, false, false),
        am(SYSVAR_CLOCK_PUBKEY, false, false),
        am(SystemProgram.programId, false, false)
    ];

    const zoints_1_trans = new Transaction().add(
        new TransactionInstruction({
            keys: zoints_1_keys,
            programId,
            data: Buffer.from(zoints_1_data)
        })
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

    const staker_1_stake = (
        await PublicKey.findProgramAddress(
            [
                Buffer.from('stake'),
                user_1_community.publicKey.toBuffer(),
                staker_1.publicKey.toBuffer()
            ],
            programId
        )
    )[0];

    /*
        let funder_info = next_account_info(iter)?;
        let staker_info = next_account_info(iter)?;
        let staker_associated_info = next_account_info(iter)?;
        let community_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let stake_info = next_account_info(iter)?;
        let rent_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;
    */
    const staker_1_keys: AccountMeta[] = [
        am(config.funder.publicKey, true, false),
        am(staker_1.publicKey, true, false),
        am(staker_1_associated.address, false, false),
        am(user_1_community.publicKey, false, false),
        am(settings_id, false, false),
        am(staker_1_stake, false, true),
        am(SYSVAR_RENT_PUBKEY, false, false),
        am(SYSVAR_CLOCK_PUBKEY, false, false),
        am(SystemProgram.programId, false, false)
    ];
    const staker_1_data = Buffer.alloc(1, 2);
    const staker_1_trans = new Transaction().add(
        new TransactionInstruction({
            keys: staker_1_keys,
            programId,
            data: staker_1_data
        })
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

    /*
        let _funder_info = next_account_info(iter)?;
        let staker_info = next_account_info(iter)?;
        let staker_associated_info = next_account_info(iter)?;
        let community_info = next_account_info(iter)?;
        let stake_pool_info = next_account_info(iter)?;
        let reward_fund_info = next_account_info(iter)?;
        let settings_info = next_account_info(iter)?;
        let stake_info = next_account_info(iter)?;
        let program_info = next_account_info(iter)?;
        let clock_info = next_account_info(iter)?;
        */

    const stake_1_keys: AccountMeta[] = [
        am(config.funder.publicKey, true, false),
        am(staker_1.publicKey, true, false),
        am(staker_1_associated.address, false, true),
        am(user_1_community.publicKey, false, true),
        am(stake_pool_id, false, true),
        am(reward_fund_id, false, true),
        am(settings_id, false, true),
        am(staker_1_stake, false, true),
        am(programId, false, false),
        am(SYSVAR_CLOCK_PUBKEY, false, false)
    ];
    const stake_1_instruction = new Stake(20_000);
    const stake_1_data = borsh.serialize(Stake.schema, stake_1_instruction);
    const stake_1_trans = new Transaction().add(
        new TransactionInstruction({
            keys: stake_1_keys,
            programId,
            data: Buffer.from(stake_1_data)
        })
    );

    const stake_1_sig = await sendAndConfirmTransaction(
        connection,
        stake_1_trans,
        [config.funder, staker_1]
    );
    console.log(`user1/comm1 Staked 20,000 ZEE: ${stake_1_sig}`);
})();
