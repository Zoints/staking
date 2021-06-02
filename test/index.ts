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
import { Initialize, RegisterCommunity } from './instructions';
import { sendAndConfirmTransaction } from './util';
import BN from 'bn.js';

const zeroKey = new PublicKey(Buffer.alloc(0, 32));

const connection = new Connection('http://localhost:8899');
const funder = new Keypair();

const token_id = new Keypair();
const authority = new Keypair();

const mint_authority = new Keypair();
const deploy_key = new Keypair();
const programId = deploy_key.publicKey;

const token = new Token(
    connection,
    token_id.publicKey,
    TOKEN_PROGRAM_ID,
    funder
);

function am(
    pubkey: PublicKey,
    isSigner: boolean,
    isWritable: boolean
): AccountMeta {
    return { pubkey, isSigner, isWritable };
}

(async () => {
    console.log(`Funding ${funder.publicKey.toBase58()} with 20 SOL`);
    let sig = await connection.requestAirdrop(
        funder.publicKey,
        20 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig);

    console.log(`Deploy BPF to ${deploy_key.publicKey.toBase58()}`);
    const programdata = fs.readFileSync('../program/target/deploy/staking.so');
    if (
        !(await BpfLoader.load(
            connection,
            funder,
            deploy_key,
            programdata,
            BPF_LOADER_PROGRAM_ID
        ))
    ) {
        console.log('Loading bpf failed');
        process.exit(1);
    }

    console.log(`Creating new SPL Token ${token_id.publicKey.toBase58()}`);

    // doing it manually since the library doesn't accept pre-defined pubkeys
    const balanceNeeded = await Token.getMinBalanceRentForExemptMint(
        connection
    );

    const transaction = new Transaction();
    transaction.add(
        SystemProgram.createAccount({
            fromPubkey: funder.publicKey,
            newAccountPubkey: token_id.publicKey,
            lamports: balanceNeeded,
            space: MintLayout.span,
            programId: TOKEN_PROGRAM_ID
        })
    );

    transaction.add(
        Token.createInitMintInstruction(
            TOKEN_PROGRAM_ID,
            token_id.publicKey,
            0,
            mint_authority.publicKey,
            null
        )
    );

    await sendAndConfirmTransaction(connection, transaction, [
        funder,
        token_id
    ]);

    console.log(`Attempting to initialize`);

    const init_instruction = new Initialize(20_000);
    const init_data = borsh.serialize(Initialize.schema, init_instruction);

    const settings_id = (
        await PublicKey.findProgramAddress([Buffer.from('settings')], programId)
    )[0];

    const init_keys: AccountMeta[] = [
        am(funder.publicKey, true, false),
        am(authority.publicKey, true, false),
        am(settings_id, false, true),
        am(token_id.publicKey, false, false),
        am(SYSVAR_RENT_PUBKEY, false, false),
        am(SystemProgram.programId, false, false)
    ];

    const init_trans = new Transaction().add(
        new TransactionInstruction({
            keys: init_keys,
            programId,
            data: Buffer.from(init_data)
        })
    );

    const init_sig = await sendAndConfirmTransaction(connection, init_trans, [
        funder,
        authority
    ]);
    console.log(`Initialized: ${init_sig}`);

    //////////
    ////////// USER COMMUNITY 1
    //////////

    const user_1 = new Keypair();
    const user_1_community = new Keypair();

    const user_1_assoc = await token.getOrCreateAssociatedAccountInfo(
        user_1.publicKey
    );
    await token.mintTo(user_1_assoc.address, mint_authority, [], 20_000);

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

    const user_1_keys: AccountMeta[] = [
        am(funder.publicKey, true, false),
        am(user_1.publicKey, true, false),
        am(settings_id, false, false),
        am(user_1_community.publicKey, true, true),
        am(user_1_primary.publicKey, false, false),
        am(user_1_primary_assoc.address, false, true),
        am(zeroKey, false, false),
        am(zeroKey, false, false),
        am(user_1_referrer.publicKey, false, false),
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
        funder,
        user_1,
        user_1_community
    ])
        .then((sig) => console.log(`User 1 community registered: ${sig}`))
        .catch((e) => console.log(e));

    //////////
    ////////// ZOINTS COMMUNITY 1
    //////////

    const zoints_1 = new Keypair();
    const zoints_1_community = new Keypair();

    const zoints_1_assoc = await token.getOrCreateAssociatedAccountInfo(
        zoints_1.publicKey
    );
    await token.mintTo(zoints_1_assoc.address, mint_authority, [], 20_000);

    const zoints_1_instruction = new RegisterCommunity();
    const zoints_1_data = borsh.serialize(
        RegisterCommunity.schema,
        zoints_1_instruction
    );

    const zoints_1_primary = new Keypair();
    const zoints_1_primary_assoc = await token.getOrCreateAssociatedAccountInfo(
        zoints_1_primary.publicKey
    );
    const zoints_1_referrer = zeroKey;

    const zoints_1_keys: AccountMeta[] = [
        am(funder.publicKey, true, false),
        am(zoints_1.publicKey, true, false),
        am(settings_id, false, false),
        am(zoints_1_community.publicKey, true, true),
        am(zoints_1_primary.publicKey, false, false),
        am(zoints_1_primary_assoc.address, false, true),
        am(zoints_1.publicKey, false, false),
        am(zoints_1_assoc.address, false, false),
        am(zoints_1_referrer, false, false),
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
        funder,
        zoints_1,
        zoints_1_community
    ])
        .then((sig) => console.log(`Zoints 1 community registered: ${sig}`))
        .catch((e) => console.log(e));

    //////////
    ////////// STAKER 1
    //////////
    const staker_1 = new Keypair();
    const staker_1_associated = await token.getOrCreateAssociatedAccountInfo(
        staker_1.publicKey
    );
    await token.mintTo(staker_1_associated.address, mint_authority, [], 20_000);

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

    const staker_1_keys: AccountMeta[] = [
        am(funder.publicKey, true, false),
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
        [funder, staker_1]
    );
    console.log(`Staker_1/user_community_1 stake created: ${staker_1_sig}`);
})();
