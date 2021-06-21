import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    Token,
    TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import {
    AccountMeta,
    PublicKey,
    SystemProgram,
    SYSVAR_CLOCK_PUBKEY,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction
} from '@solana/web3.js';
import { Staking, ZERO_KEY } from '.';
import * as borsh from 'borsh';
import './extendBorsh';

export enum Instructions {
    Initialize,
    RegisterCommunity,
    InitializeStake,
    Stake,
    WithdrawUnbond,
    ClaimPrimary,
    ClaimSecondary
}

export class SimpleSchema {
    instructionId: number;

    static schema: borsh.Schema = new Map([
        [
            SimpleSchema,
            {
                kind: 'struct',
                fields: [['instructionId', 'u8']]
            }
        ]
    ]);

    constructor(id: number) {
        this.instructionId = id;
    }
}

export class AmountSchema {
    instructionId: number;
    amount: bigint;

    static schema: borsh.Schema = new Map([
        [
            AmountSchema,
            {
                kind: 'struct',
                fields: [
                    ['instructionId', 'u8'],
                    ['amount', 'i64']
                ]
            }
        ]
    ]);

    constructor(id: number, amount: bigint) {
        this.instructionId = id;
        this.amount = amount;
    }
}

export async function Initialize(
    programId: PublicKey,
    funder: PublicKey,
    authority: PublicKey,
    mint: PublicKey
): Promise<TransactionInstruction> {
    const settingsId = await Staking.settingsId(programId);
    const poolAuthorityId = await Staking.poolAuthorityId(programId);
    const stakePoolId = await Staking.stakePoolId(programId);
    const rewardPoolId = await Staking.rewardPoolId(programId);

    const keys: AccountMeta[] = [
        am(funder, true, false),
        am(authority, true, false),
        am(settingsId, false, true),
        am(poolAuthorityId, false, false),
        am(stakePoolId, false, true),
        am(rewardPoolId, false, true),
        am(mint, false, false),
        am(SYSVAR_RENT_PUBKEY, false, false),
        am(SYSVAR_CLOCK_PUBKEY, false, false),
        am(TOKEN_PROGRAM_ID, false, false),
        am(SystemProgram.programId, false, false)
    ];

    const instruction = new SimpleSchema(Instructions.Initialize);
    const instructionData = borsh.serialize(SimpleSchema.schema, instruction);

    return new TransactionInstruction({
        keys: keys,
        programId,
        data: Buffer.from(instructionData)
    });
}

export async function RegisterCommunity(
    programId: PublicKey,
    funder: PublicKey,
    owner: PublicKey,
    community: PublicKey,
    primary: PublicKey,
    secondary?: PublicKey
): Promise<TransactionInstruction> {
    if (secondary === undefined) {
        secondary = ZERO_KEY;
    }

    const keys: AccountMeta[] = [
        am(funder, true, false),
        am(owner, true, false),
        am(community, true, true),
        am(primary, false, false),
        am(secondary, false, false),
        am(SYSVAR_RENT_PUBKEY, false, false),
        am(SYSVAR_CLOCK_PUBKEY, false, false),
        am(SystemProgram.programId, false, false)
    ];

    const instruction = new SimpleSchema(Instructions.RegisterCommunity);
    const instructionData = borsh.serialize(SimpleSchema.schema, instruction);

    return new TransactionInstruction({
        keys: keys,
        programId,
        data: Buffer.from(instructionData)
    });
}

export async function InitializeStake(
    programId: PublicKey,
    funder: PublicKey,
    owner: PublicKey,
    community: PublicKey
): Promise<TransactionInstruction> {
    const stakeId = await Staking.stakerAddress(programId, community, owner);

    const keys: AccountMeta[] = [
        am(funder, true, false),
        am(owner, true, false),
        am(community, false, false),
        am(stakeId, false, true),
        am(SYSVAR_RENT_PUBKEY, false, false),
        am(SYSVAR_CLOCK_PUBKEY, false, false),
        am(SystemProgram.programId, false, false)
    ];

    const instruction = new SimpleSchema(Instructions.InitializeStake);
    const instructionData = borsh.serialize(SimpleSchema.schema, instruction);

    return new TransactionInstruction({
        keys: keys,
        programId,
        data: Buffer.from(instructionData)
    });
}

export async function Stake(
    programId: PublicKey,
    funder: PublicKey,
    staker: PublicKey,
    stakerAssociated: PublicKey,
    community: PublicKey,
    mint: PublicKey,
    amount: number | bigint
): Promise<TransactionInstruction> {
    const settingsId = await Staking.settingsId(programId);
    const poolAuthorityId = await Staking.poolAuthorityId(programId);
    const stakePoolId = await Staking.stakePoolId(programId);
    const rewardPoolId = await Staking.rewardPoolId(programId);
    const stakeId = await Staking.stakerAddress(programId, community, staker);

    const keys: AccountMeta[] = [
        am(funder, true, false),
        am(staker, true, false),
        am(stakerAssociated, false, true),
        am(community, false, true),
        am(poolAuthorityId, false, false),
        am(stakePoolId, false, true),
        am(rewardPoolId, false, true),
        am(settingsId, false, true),
        am(stakeId, false, true),
        am(mint, false, true),
        am(SYSVAR_CLOCK_PUBKEY, false, false),
        am(TOKEN_PROGRAM_ID, false, false)
    ];

    const instruction = new AmountSchema(Instructions.Stake, BigInt(amount));
    const instructionData = borsh.serialize(AmountSchema.schema, instruction);

    return new TransactionInstruction({
        keys: keys,
        programId,
        data: Buffer.from(instructionData)
    });
}

export async function WithdrawUnbond(
    programId: PublicKey,
    funder: PublicKey,
    staker: PublicKey,
    stakerAssociated: PublicKey,
    community: PublicKey
): Promise<TransactionInstruction> {
    const settingsId = await Staking.settingsId(programId);
    const poolAuthorityId = await Staking.poolAuthorityId(programId);
    const stakePoolId = await Staking.stakePoolId(programId);
    const stakeId = await Staking.stakerAddress(programId, community, staker);

    const keys: AccountMeta[] = [
        am(funder, true, false),
        am(staker, true, false),
        am(stakerAssociated, false, true),
        am(community, false, true),
        am(settingsId, false, true),
        am(poolAuthorityId, false, false),
        am(stakePoolId, false, true),
        am(stakeId, false, true),
        am(SYSVAR_CLOCK_PUBKEY, false, false),
        am(TOKEN_PROGRAM_ID, false, false)
    ];

    const instruction = new SimpleSchema(Instructions.WithdrawUnbond);
    const instructionData = borsh.serialize(SimpleSchema.schema, instruction);

    return new TransactionInstruction({
        keys: keys,
        programId,
        data: Buffer.from(instructionData)
    });
}

export async function ClaimPrimary(
    programId: PublicKey,
    funder: PublicKey,
    authority: PublicKey,
    authorityAssociated: PublicKey,
    community: PublicKey,
    mint: PublicKey
): Promise<TransactionInstruction> {
    const settingsId = await Staking.settingsId(programId);
    const poolAuthorityId = await Staking.poolAuthorityId(programId);
    const rewardPoolId = await Staking.rewardPoolId(programId);

    const keys: AccountMeta[] = [
        am(funder, true, false),
        am(authority, true, false),
        am(authorityAssociated, false, true),
        am(community, false, true),
        am(settingsId, false, true),
        am(poolAuthorityId, false, false),
        am(rewardPoolId, false, true),
        am(mint, false, true),
        am(SYSVAR_CLOCK_PUBKEY, false, false),
        am(TOKEN_PROGRAM_ID, false, false)
    ];

    const instruction = new SimpleSchema(Instructions.ClaimPrimary);
    const instructionData = borsh.serialize(SimpleSchema.schema, instruction);

    return new TransactionInstruction({
        keys: keys,
        programId,
        data: Buffer.from(instructionData)
    });
}
export async function ClaimSecondary(
    programId: PublicKey,
    funder: PublicKey,
    authority: PublicKey,
    authorityAssociated: PublicKey,
    community: PublicKey,
    mint: PublicKey
): Promise<TransactionInstruction> {
    const settingsId = await Staking.settingsId(programId);
    const poolAuthorityId = await Staking.poolAuthorityId(programId);
    const rewardPoolId = await Staking.rewardPoolId(programId);

    const keys: AccountMeta[] = [
        am(funder, true, false),
        am(authority, true, false),
        am(authorityAssociated, false, true),
        am(community, false, true),
        am(settingsId, false, true),
        am(poolAuthorityId, false, false),
        am(rewardPoolId, false, true),
        am(mint, false, true),
        am(SYSVAR_CLOCK_PUBKEY, false, false),
        am(TOKEN_PROGRAM_ID, false, false)
    ];

    const instruction = new SimpleSchema(Instructions.ClaimSecondary);
    const instructionData = borsh.serialize(SimpleSchema.schema, instruction);

    return new TransactionInstruction({
        keys: keys,
        programId,
        data: Buffer.from(instructionData)
    });
}

function am(
    pubkey: PublicKey,
    isSigner: boolean,
    isWritable: boolean
): AccountMeta {
    return { pubkey, isSigner, isWritable };
}
