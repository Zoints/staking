// requires a running local node set up with the staking system
// ie a running test_server is enough
// staking program id, funder, and mint authority needs to be copied from existing setup

import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    Token,
    TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
    SystemProgram,
    Transaction
} from '@solana/web3.js';
import { Instruction, Staking } from '@zoints/staking';
import { create } from 'domain';

const programId = new PublicKey('GGgStUEFvrGGj3aBH6mcLzyrMM6EyKDDuLZYbgZczq4Q');
const mint = new PublicKey('5JKMQjbzy1T4w8e84wZ6rVmRZXi7gz4t7ugA9BrYNJuj');
const mintAuthority = Keypair.fromSecretKey(
    Buffer.from(
        '2c6433c70d57bc3cf4e124f41974e91e302271970fcccb0a0c9eea790cad255245994ae8a2f00ea11e007b77cede655bbf15d8686e2a3ed25f6e10c254be79ca',
        'hex'
    )
);
const funder = Keypair.fromSecretKey(
    Buffer.from(
        '8310fbe7e0ff0b1103cdf4d571d1e475e1b6c4512e19db8f993da246143234ddc8d6e52997304033cc2aa1c2318d58c39a087c134772594db475109c39aa1806',
        'hex'
    )
);

interface Community {
    pubkey: PublicKey;
    owner: PublicKey;
    primary: PublicKey;
    secondary: PublicKey | undefined;
}

interface Address {
    key: Keypair;
    pubkey: PublicKey;
    assoc: PublicKey;
}

const connection = new Connection('http://localhost:8899', 'confirmed');
const staking = new Staking(
    new PublicKey('GGgStUEFvrGGj3aBH6mcLzyrMM6EyKDDuLZYbgZczq4Q'),
    connection
);
const token = new Token(connection, mint, TOKEN_PROGRAM_ID, funder);

async function createCommunity(
    owner: PublicKey,
    primary: PublicKey,
    secondary?: PublicKey
): Promise<Community> {
    const comm = new Keypair();
    const tx = new Transaction().add(
        await Instruction.RegisterCommunity(
            programId,
            funder.publicKey,
            owner,
            comm.publicKey,
            primary,
            secondary
        )
    );

    await sendAndConfirmTransaction(connection, tx, [funder, comm]);

    return { pubkey: comm.publicKey, owner, primary, secondary };
}

async function createFundedAddress(): Promise<Address> {
    const staker = new Keypair();
    let assoc = await token.getOrCreateAssociatedAccountInfo(staker.publicKey);
    await token.mintTo(assoc.address, mintAuthority, [], 400_000);

    return { key: staker, pubkey: staker.publicKey, assoc: assoc.address };
}

async function createAddress(): Promise<Address> {
    const staker = new Keypair();
    let assoc = await token.getOrCreateAssociatedAccountInfo(staker.publicKey);
    return { key: staker, pubkey: staker.publicKey, assoc: assoc.address };
}

(async () => {
    const settings = await staking.getSettings();

    const staked1Primary = await createAddress();
    const staked1Secondary = await createAddress();
    const staked1Community = await createCommunity(
        staked1Primary.pubkey,
        staked1Primary.pubkey,
        staked1Secondary.pubkey
    );

    const staked2Primary = await createAddress();
    const staked2Secondary = await createAddress();
    const staked2Community = await createCommunity(
        staked2Primary.pubkey,
        staked2Primary.pubkey,
        staked2Secondary.pubkey
    );

    const staker = await createFundedAddress();
    const stakerCommunity = await createCommunity(staker.pubkey, staker.pubkey);

    const outsideStaker1 = await createFundedAddress();
    const outsideStaker2 = await createFundedAddress();
})()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
