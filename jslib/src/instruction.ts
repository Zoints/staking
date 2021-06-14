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
import { Staking, ZERO_KEY } from './';
import * as borsh from 'borsh';

export enum Instructions {
    Initialize,
    RegisterCommunity,
    InitializeStake,
    Stake,
    Unstake,
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
    amount: number;

    static schema: borsh.Schema = new Map([
        [
            AmountSchema,
            {
                kind: 'struct',
                fields: [
                    ['instructionId', 'u8'],
                    ['amount', 'u64']
                ]
            }
        ]
    ]);

    constructor(id: number, amount: number) {
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
    primaryAssociated: PublicKey,
    secondary?: PublicKey,
    secondaryAssociated?: PublicKey
): Promise<TransactionInstruction> {
    const settingsId = await Staking.settingsId(programId);

    if (secondary === undefined || secondaryAssociated === undefined) {
        secondary = ZERO_KEY;
        secondaryAssociated = ZERO_KEY;
    }

    const keys: AccountMeta[] = [
        am(funder, true, false),
        am(owner, true, false),
        am(settingsId, false, false),
        am(community, true, true),
        am(primary, false, false),
        am(primaryAssociated, false, true),
        am(secondary, false, false),
        am(secondaryAssociated, false, false),
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
    const stake = await Staking.stakeAddress(programId, community, owner);

    const keys: AccountMeta[] = [
        am(funder, true, false),
        am(owner, true, false),
        am(community, false, false),
        am(stake, false, true),
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

function am(
    pubkey: PublicKey,
    isSigner: boolean,
    isWritable: boolean
): AccountMeta {
    return { pubkey, isSigner, isWritable };
}
