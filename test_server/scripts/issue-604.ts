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
import { Instruction, Instructions, Staking } from '@zoints/staking';
import BN from 'bn.js';
import { create } from 'domain';

const programId = new PublicKey('GGgStUEFvrGGj3aBH6mcLzyrMM6EyKDDuLZYbgZczq4Q');
const mint = new PublicKey('5JKMQjbzy1T4w8e84wZ6rVmRZXi7gz4t7ugA9BrYNJuj');
const feeRecipient = new PublicKey(
    '274Mk1JY6sKNtbeWtZsW5DSC3SWmCknmx7qsPR1EWxpQ'
);
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
    name: string;
    pubkey: PublicKey;
    owner: PublicKey;
    primary: PublicKey;
    secondary: PublicKey | undefined;
}

interface Address {
    name: string;
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
    name: string,
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

    return { name, pubkey: comm.publicKey, owner, primary, secondary };
}

async function createFundedAddress(name: string): Promise<Address> {
    const staker = new Keypair();
    let assoc = await token.getOrCreateAssociatedAccountInfo(staker.publicKey);
    await token.mintTo(assoc.address, mintAuthority, [], 400_000);

    return {
        name,
        key: staker,
        pubkey: staker.publicKey,
        assoc: assoc.address
    };
}

async function createAddress(name: string): Promise<Address> {
    const staker = new Keypair();
    let assoc = await token.getOrCreateAssociatedAccountInfo(staker.publicKey);
    return {
        name,
        key: staker,
        pubkey: staker.publicKey,
        assoc: assoc.address
    };
}

async function stake(staker: Address, community: Community, amount: bigint) {
    const tx = new Transaction().add(
        await Instruction.Stake(
            programId,
            funder.publicKey,
            staker.pubkey,
            staker.assoc,
            community.pubkey,
            feeRecipient,
            community.primary,
            community.secondary || PublicKey.default,
            amount
        )
    );
    const txid = await sendAndConfirmTransaction(connection, tx, [
        funder,
        staker.key
    ]);
    const claimed = await extractClaimed(txid);
    console.log(
        `${staker.name} staked ${amount} ZEE with ${community.name}. claimed ${claimed} ZEE during the process`
    );
}

async function claim(staker: Address) {
    const tx = new Transaction().add(
        await Instruction.Claim(
            programId,
            funder.publicKey,
            staker.pubkey,
            staker.assoc
        )
    );
    const txid = await sendAndConfirmTransaction(connection, tx, [
        funder,
        staker.key
    ]);

    const claimed = await extractClaimed(txid);

    console.log(`${staker.name} claimed ${claimed} ZEE`);
}

const claimed = /zee claimed: (\d+)/;

async function extractClaimed(sig: string): Promise<number> {
    const result = await connection.getTransaction(sig);

    if (result === null) {
        throw new Error('unable to retrieve transaction');
    }

    if (result.meta === null) {
        throw new Error('transaction has no meta');
    }

    if (
        result.meta.logMessages === null ||
        result.meta.logMessages === undefined
    ) {
        throw new Error('transaction has no logs');
    }

    for (const line of result.meta.logMessages) {
        const match = line.match(claimed);
        if (match) {
            return Number(match[1]);
        }
    }
    return 0;
}

async function printBeneficiary(rps: BN, address: Address) {
    const bene = await staking.getBeneficiary(address.pubkey);
    console.log(address.name);
    console.log(`==============`);
    console.log(`\t       staked = ${bene.staked.toNumber()}`);
    console.log(
        `\t  harvestable = ${bene.holding.add(bene.calculateReward(rps))}`
    );
    const balance = await connection.getTokenAccountBalance(address.assoc);
    console.log(`\twallet balance = ${balance.value.uiAmount}`);
    console.log();
}

(async () => {
    const staked1Primary = await createAddress('Community1 Primary');
    const staked1Secondary = await createAddress('Community1 Secondary');
    const staked1Community = await createCommunity(
        'Community1',
        staked1Primary.pubkey,
        staked1Primary.pubkey,
        staked1Secondary.pubkey
    );

    const staked2Primary = await createAddress('Community2 Primary');
    const staked2Secondary = await createAddress('Community2 Secondary');
    const staked2Community = await createCommunity(
        'Community2',
        staked2Primary.pubkey,
        staked2Primary.pubkey,
        staked2Secondary.pubkey
    );

    const staker = await createFundedAddress('Staker');
    const stakerCommunity = await createCommunity(
        'StakerCommunity',
        staker.pubkey,
        staker.pubkey
    );

    const outsideStaker1 = await createFundedAddress('Outside Staker 1');
    const outsideStaker2 = await createFundedAddress('Outside Staker 2');

    const tx = new Transaction().add(
        await Instruction.InitializeStake(
            programId,
            funder.publicKey,
            staker.pubkey,
            staked1Community.pubkey,
            mint
        ),
        await Instruction.InitializeStake(
            programId,
            funder.publicKey,
            staker.pubkey,
            staked2Community.pubkey,
            mint
        ),
        await Instruction.InitializeStake(
            programId,
            funder.publicKey,
            outsideStaker1.pubkey,
            stakerCommunity.pubkey,
            mint
        ),
        await Instruction.InitializeStake(
            programId,
            funder.publicKey,
            outsideStaker2.pubkey,
            stakerCommunity.pubkey,
            mint
        )
    );
    await sendAndConfirmTransaction(connection, tx, [
        funder,
        staker.key,
        outsideStaker1.key,
        outsideStaker2.key
    ]);

    const printState = async () => {
        const settings = await staking.getSettings();
        const rps = settings.calculateRewardPerShare(new Date());

        await printBeneficiary(rps, staked1Primary);
        await printBeneficiary(rps, staked1Secondary);
        await printBeneficiary(rps, staked2Primary);
        await printBeneficiary(rps, staked2Secondary);

        await printBeneficiary(rps, staker);

        await printBeneficiary(rps, outsideStaker1);
        await printBeneficiary(rps, outsideStaker2);
    };

    await printState();

    await stake(outsideStaker1, stakerCommunity, 50_000n);
    await printState();
    await stake(outsideStaker2, stakerCommunity, 100_000n);
    await stake(staker, staked1Community, 75_000n);
    await stake(staker, staked2Community, 100_000n);

    await wait(2000);
    await printState();

    await stake(outsideStaker1, stakerCommunity, -25_000n);
    await printState();
})()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
