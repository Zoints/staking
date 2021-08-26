import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
    AccountMeta,
    PublicKey,
    SystemProgram,
    SYSVAR_CLOCK_PUBKEY,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction
} from '@solana/web3.js';
import { Staking } from '.';
import * as borsh from 'borsh';
import './extendBorsh';
import BN from 'bn.js';

export enum Instructions {
    Initialize,
    RegisterCommunity,
    InitializeStake,
    Stake,
    WithdrawUnbond,
    Claim
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

export class InitSchema {
    instructionId: number;
    start_time: bigint;
    unbonding_duration: BN;

    static schema: borsh.Schema = new Map([
        [
            InitSchema,
            {
                kind: 'struct',
                fields: [
                    ['instructionId', 'u8'],
                    ['start_time', 'i64'],
                    ['unbonding_duration', 'u64']
                ]
            }
        ]
    ]);

    constructor(id: number, start_time: bigint, unbonding_duration: BN) {
        this.instructionId = id;
        this.start_time = start_time;
        this.unbonding_duration = unbonding_duration;
    }
}

export class Instruction {
    public static async Initialize(
        programId: PublicKey,
        funder: PublicKey,
        feeRecipient: PublicKey,
        mint: PublicKey,
        startTime: Date,
        unbondingDuration: number
    ): Promise<TransactionInstruction> {
        const settingsId = await Staking.settingsId(programId);
        const poolAuthorityId = await Staking.poolAuthorityId(programId);
        const rewardPoolId = await Staking.rewardPoolId(programId);
        const feeBeneficiary = await Staking.beneficiary(
            feeRecipient,
            programId
        );

        const keys: AccountMeta[] = [
            am(funder, true, true),
            am(settingsId, false, true),
            am(poolAuthorityId, false, false),
            am(rewardPoolId, false, true),
            am(mint, false, false),
            am(feeRecipient, true, false),
            am(feeBeneficiary, false, true),
            am(SYSVAR_RENT_PUBKEY, false, false),
            am(TOKEN_PROGRAM_ID, false, false),
            am(SystemProgram.programId, false, false)
        ];

        const instruction = new InitSchema(
            Instructions.Initialize,
            BigInt(Math.floor(startTime.getTime() / 1000)),
            new BN(unbondingDuration)
        );
        const instructionData = borsh.serialize(InitSchema.schema, instruction);

        return new TransactionInstruction({
            keys: keys,
            programId,
            data: Buffer.from(instructionData)
        });
    }

    public static async RegisterCommunity(
        programId: PublicKey,
        funder: PublicKey,
        owner: PublicKey,
        community: PublicKey,
        primary: PublicKey,
        secondary?: PublicKey
    ): Promise<TransactionInstruction> {
        if (secondary === undefined) {
            secondary = PublicKey.default;
        }

        const primaryBeneficiary = await Staking.beneficiary(
            primary,
            programId
        );
        const secondaryBeneficiary = await Staking.beneficiary(
            secondary,
            programId
        );

        const keys: AccountMeta[] = [
            am(funder, true, true),
            am(owner, false, false),
            am(community, true, true),
            am(primary, false, false),
            am(primaryBeneficiary, false, true),
            am(secondary, false, false),
            am(secondaryBeneficiary, false, true),
            am(SYSVAR_RENT_PUBKEY, false, false),
            am(SYSVAR_CLOCK_PUBKEY, false, false),
            am(SystemProgram.programId, false, false)
        ];

        const instruction = new SimpleSchema(Instructions.RegisterCommunity);
        const instructionData = borsh.serialize(
            SimpleSchema.schema,
            instruction
        );

        return new TransactionInstruction({
            keys: keys,
            programId,
            data: Buffer.from(instructionData)
        });
    }

    public static async InitializeStake(
        programId: PublicKey,
        funder: PublicKey,
        staker: PublicKey,
        community: PublicKey,
        mint: PublicKey
    ): Promise<TransactionInstruction> {
        const stakeId = await Staking.stakeAddress(
            programId,
            community,
            staker
        );

        const settings = await Staking.settingsId(programId);

        const stakerFund = await Staking.stakeFundAddress(
            community,
            staker,
            programId
        );
        const stakerBeneficiary = await Staking.beneficiary(staker, programId);

        const keys: AccountMeta[] = [
            am(funder, true, true),
            am(staker, true, false),
            am(stakerFund, false, true),
            am(stakerBeneficiary, false, true),
            am(community, false, true), // true because of pairing
            am(stakeId, false, true),

            am(mint, false, false),
            am(settings, false, true), // true because of pairing

            am(SYSVAR_RENT_PUBKEY, false, false),
            am(SYSVAR_CLOCK_PUBKEY, false, false),
            am(TOKEN_PROGRAM_ID, false, false),
            am(SystemProgram.programId, false, false)
        ];

        const instruction = new SimpleSchema(Instructions.InitializeStake);
        const instructionData = borsh.serialize(
            SimpleSchema.schema,
            instruction
        );

        return new TransactionInstruction({
            keys: keys,
            programId,
            data: Buffer.from(instructionData)
        });
    }

    public static async Stake(
        programId: PublicKey,
        funder: PublicKey,
        staker: PublicKey,
        stakerAssociated: PublicKey,
        community: PublicKey,
        feeRecipient: PublicKey,
        primary: PublicKey,
        secondary: PublicKey,
        amount: number | bigint
    ): Promise<TransactionInstruction> {
        const settingsId = await Staking.settingsId(programId);
        const poolAuthorityId = await Staking.poolAuthorityId(programId);
        const rewardPoolId = await Staking.rewardPoolId(programId);
        const stakeId = await Staking.stakeAddress(
            programId,
            community,
            staker
        );

        const stakerBeneficiary = await Staking.beneficiary(staker, programId);
        const stakerFund = await Staking.stakeFundAddress(
            community,
            staker,
            programId
        );

        const feeBeneficiary = await Staking.beneficiary(
            feeRecipient,
            programId
        );
        const primaryBeneficiary = await Staking.beneficiary(
            primary,
            programId
        );
        const secondaryBeneficiary = await Staking.beneficiary(
            secondary,
            programId
        );

        const keys: AccountMeta[] = [
            am(funder, true, true),
            am(staker, true, false),
            am(stakerBeneficiary, false, true),
            am(stakerFund, false, true),
            am(stakerAssociated, false, true),
            am(community, false, true),
            am(primaryBeneficiary, false, true),
            am(secondaryBeneficiary, false, true),
            am(poolAuthorityId, false, false),
            am(rewardPoolId, false, true),
            am(settingsId, false, true),
            am(feeBeneficiary, false, true),
            am(stakeId, false, true),
            am(SYSVAR_CLOCK_PUBKEY, false, false),
            am(TOKEN_PROGRAM_ID, false, false)
        ];

        const instruction = new AmountSchema(
            Instructions.Stake,
            BigInt(amount)
        );
        const instructionData = borsh.serialize(
            AmountSchema.schema,
            instruction
        );

        return new TransactionInstruction({
            keys: keys,
            programId,
            data: Buffer.from(instructionData)
        });
    }

    public static async WithdrawUnbond(
        programId: PublicKey,
        funder: PublicKey,
        staker: PublicKey,
        stakerAssociated: PublicKey,
        community: PublicKey
    ): Promise<TransactionInstruction> {
        const settingsId = await Staking.settingsId(programId);
        const stakeFund = await Staking.stakeFundAddress(
            community,
            staker,
            programId
        );
        const stakeId = await Staking.stakeAddress(
            programId,
            community,
            staker
        );

        const keys: AccountMeta[] = [
            am(funder, true, true),
            am(staker, true, false),
            am(stakeFund, false, true),
            am(stakerAssociated, false, true),
            am(community, false, false),
            am(settingsId, false, false),
            am(stakeId, false, true),
            am(SYSVAR_CLOCK_PUBKEY, false, false),
            am(TOKEN_PROGRAM_ID, false, false)
        ];

        const instruction = new SimpleSchema(Instructions.WithdrawUnbond);
        const instructionData = borsh.serialize(
            SimpleSchema.schema,
            instruction
        );

        return new TransactionInstruction({
            keys: keys,
            programId,
            data: Buffer.from(instructionData)
        });
    }

    public static async Claim(
        programId: PublicKey,
        funder: PublicKey,
        authority: PublicKey,
        authorityAssociated: PublicKey
    ) {
        const settingsId = await Staking.settingsId(programId);
        const poolAuthorityId = await Staking.poolAuthorityId(programId);
        const rewardPoolId = await Staking.rewardPoolId(programId);
        const beneficiary = await Staking.beneficiary(authority, programId);

        const keys: AccountMeta[] = [
            am(funder, true, true),
            am(authority, true, false),
            am(beneficiary, false, true),
            am(authorityAssociated, false, true),
            am(settingsId, false, true),
            am(poolAuthorityId, false, false),
            am(rewardPoolId, false, true),
            am(SYSVAR_CLOCK_PUBKEY, false, false),
            am(TOKEN_PROGRAM_ID, false, false)
        ];

        const instruction = new SimpleSchema(Instructions.Claim);
        const instructionData = borsh.serialize(
            SimpleSchema.schema,
            instruction
        );

        return new TransactionInstruction({
            keys: keys,
            programId,
            data: Buffer.from(instructionData)
        });
    }
}

function am(
    pubkey: PublicKey,
    isSigner: boolean,
    isWritable: boolean
): AccountMeta {
    return { pubkey, isSigner, isWritable };
}
