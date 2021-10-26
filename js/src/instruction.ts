import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
    AccountMeta,
    PublicKey,
    SystemProgram,
    SYSVAR_CLOCK_PUBKEY,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction
} from '@solana/web3.js';
import { Authority, AuthorityType, Staking } from '.';
import * as borsh from 'borsh';
import './extendBorsh';
import BN from 'bn.js';

export enum Instructions {
    Initialize,
    RegisterEndpoint,
    InitializeStake,
    Stake,
    WithdrawUnbond,
    Claim,
    TransferEndpoint,
    ChangeBeneficiaries
}

export type InstructionSchema =
    | SimpleSchema
    | AmountSchema
    | InitSchema
    | AuthoritySchema;

export class SimpleSchema {
    instructionId: Exclude<
        Instructions,
        | Instructions.Initialize
        | Instructions.Stake
        | Instructions.RegisterEndpoint
        | Instructions.TransferEndpoint
    >;

    constructor(params: {
        instructionId: Exclude<
            Instructions,
            | Instructions.Initialize
            | Instructions.Stake
            | Instructions.RegisterEndpoint
            | Instructions.TransferEndpoint
        >;
    }) {
        this.instructionId = params.instructionId;
    }
}

export class AmountSchema {
    instructionId: Instructions.Stake;
    amount: bigint;

    constructor(params: { instructionId: Instructions.Stake; amount: bigint }) {
        this.instructionId = params.instructionId;
        this.amount = params.amount;
    }
}

export class InitSchema {
    instructionId: Instructions.Initialize;
    startTime: Date;
    unbondingDuration: BN;

    constructor(params: {
        instructionId: Instructions.Initialize;
        startTime: Date;
        unbondingDuration: BN;
    }) {
        this.instructionId = params.instructionId;
        this.startTime = params.startTime;
        this.unbondingDuration = params.unbondingDuration;
    }
}

export class AuthoritySchema {
    instructionId: Extract<
        Instructions,
        Instructions.TransferEndpoint | Instructions.RegisterEndpoint
    >;
    authority: Authority;

    constructor(params: {
        instructionId: Extract<
            Instructions,
            Instructions.TransferEndpoint | Instructions.RegisterEndpoint
        >;
        authority: Authority;
    }) {
        this.instructionId = params.instructionId;
        this.authority = params.authority;
    }
}

export class Instruction {
    public static async Initialize(
        programId: PublicKey,
        funder: PublicKey,
        mint: PublicKey,
        startTime: Date,
        unbondingDuration: number
    ): Promise<TransactionInstruction> {
        const settingsId = await Staking.settingsId(programId);
        const poolAuthorityId = await Staking.poolAuthorityId(programId);
        const rewardPoolId = await Staking.rewardPoolId(programId);

        const keys: AccountMeta[] = [
            am(funder, true, true),
            am(settingsId, false, true),
            am(poolAuthorityId, false, false),
            am(rewardPoolId, false, true),
            am(mint, false, false),
            am(SYSVAR_RENT_PUBKEY, false, false),
            am(TOKEN_PROGRAM_ID, false, false),
            am(SystemProgram.programId, false, false)
        ];

        const instruction = new InitSchema({
            instructionId: Instructions.Initialize,
            startTime: startTime,
            unbondingDuration: new BN(unbondingDuration)
        });
        const instructionData = borsh.serialize(
            INSTRUCTION_SCHEMA,
            instruction
        );

        return new TransactionInstruction({
            keys: keys,
            programId,
            data: Buffer.from(instructionData)
        });
    }

    public static async RegisterEndpoint(
        programId: PublicKey,
        funder: PublicKey,
        endpoint: PublicKey,
        owner: Authority,
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
            am(endpoint, true, true),
            am(owner.address, false, false),
            am(primary, false, false),
            am(primaryBeneficiary, false, true),
            am(secondary, false, false),
            am(secondaryBeneficiary, false, true),
            am(SYSVAR_RENT_PUBKEY, false, false),
            am(SYSVAR_CLOCK_PUBKEY, false, false),
            am(SystemProgram.programId, false, false)
        ];

        const instruction = new AuthoritySchema({
            instructionId: Instructions.RegisterEndpoint,
            authority: owner
        });
        const instructionData = borsh.serialize(
            INSTRUCTION_SCHEMA,
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
        endpoint: PublicKey,
        mint: PublicKey
    ): Promise<TransactionInstruction> {
        const stakeId = await Staking.stakeAddress(programId, endpoint, staker);

        const settings = await Staking.settingsId(programId);

        const stakerFund = await Staking.stakeFundAddress(
            endpoint,
            staker,
            programId
        );
        const stakerBeneficiary = await Staking.beneficiary(staker, programId);

        const keys: AccountMeta[] = [
            am(funder, true, true),
            am(staker, true, false),
            am(stakerFund, false, true),
            am(stakerBeneficiary, false, true),
            am(endpoint, false, true), // true because of pairing
            am(stakeId, false, true),

            am(mint, false, false),
            am(settings, false, true), // true because of pairing

            am(SYSVAR_RENT_PUBKEY, false, false),
            am(SYSVAR_CLOCK_PUBKEY, false, false),
            am(TOKEN_PROGRAM_ID, false, false),
            am(SystemProgram.programId, false, false)
        ];

        const instruction = new SimpleSchema({
            instructionId: Instructions.InitializeStake
        });
        const instructionData = borsh.serialize(
            INSTRUCTION_SCHEMA,
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
        endpoint: PublicKey,
        primary: PublicKey,
        secondary: PublicKey,
        amount: bigint
    ): Promise<TransactionInstruction> {
        const settingsId = await Staking.settingsId(programId);
        const poolAuthorityId = await Staking.poolAuthorityId(programId);
        const rewardPoolId = await Staking.rewardPoolId(programId);
        const stakeId = await Staking.stakeAddress(programId, endpoint, staker);

        const stakerBeneficiary = await Staking.beneficiary(staker, programId);
        const stakerFund = await Staking.stakeFundAddress(
            endpoint,
            staker,
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
            am(endpoint, false, true),
            am(primaryBeneficiary, false, true),
            am(secondaryBeneficiary, false, true),
            am(poolAuthorityId, false, false),
            am(rewardPoolId, false, true),
            am(settingsId, false, true),
            am(stakeId, false, true),
            am(SYSVAR_CLOCK_PUBKEY, false, false),
            am(TOKEN_PROGRAM_ID, false, false)
        ];

        const instruction = new AmountSchema({
            instructionId: Instructions.Stake,
            amount
        });
        const instructionData = borsh.serialize(
            INSTRUCTION_SCHEMA,
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
        endpoint: PublicKey
    ): Promise<TransactionInstruction> {
        const settingsId = await Staking.settingsId(programId);
        const stakeFund = await Staking.stakeFundAddress(
            endpoint,
            staker,
            programId
        );
        const stakeId = await Staking.stakeAddress(programId, endpoint, staker);

        const keys: AccountMeta[] = [
            am(funder, true, true),
            am(stakeId, false, true),
            am(staker, true, false),
            am(stakeFund, false, true),
            am(stakerAssociated, false, true),
            am(endpoint, false, false),
            am(settingsId, false, false),
            am(SYSVAR_CLOCK_PUBKEY, false, false),
            am(TOKEN_PROGRAM_ID, false, false)
        ];

        const instruction = new SimpleSchema({
            instructionId: Instructions.WithdrawUnbond
        });
        const instructionData = borsh.serialize(
            INSTRUCTION_SCHEMA,
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
    ): Promise<TransactionInstruction> {
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

        const instruction = new SimpleSchema({
            instructionId: Instructions.Claim
        });
        const instructionData = borsh.serialize(
            INSTRUCTION_SCHEMA,
            instruction
        );

        return new TransactionInstruction({
            keys: keys,
            programId,
            data: Buffer.from(instructionData)
        });
    }

    public static async TransferEndpoint(
        programId: PublicKey,
        funder: PublicKey,
        endpoint: PublicKey,
        owner: PublicKey,
        ownerSigner: PublicKey,
        recipient: Authority
    ): Promise<TransactionInstruction> {
        const keys: AccountMeta[] = [
            am(funder, true, true),
            am(endpoint, false, true),
            am(owner, false, false),
            am(ownerSigner, true, false),
            am(recipient.address, false, false),
            am(recipient.address, false, false)
        ];

        const instruction = new AuthoritySchema({
            instructionId: Instructions.TransferEndpoint,
            authority: recipient
        });
        const instructionData = borsh.serialize(
            INSTRUCTION_SCHEMA,
            instruction
        );

        return new TransactionInstruction({
            keys: keys,
            programId,
            data: Buffer.from(instructionData)
        });
    }

    public static async ChangeBeneficiaries(
        programId: PublicKey,
        funder: PublicKey,
        endpoint: PublicKey,
        owner: PublicKey,
        ownerSigner: PublicKey,
        oldPrimary: PublicKey,
        oldSecondary: PublicKey,
        newPrimary: PublicKey,
        newSecondary?: PublicKey
    ): Promise<TransactionInstruction> {
        const settingsId = await Staking.settingsId(programId);
        if (newSecondary === undefined) {
            newSecondary = PublicKey.default;
        }

        const oldPrimaryBeneficiary = await Staking.beneficiary(
            oldPrimary,
            programId
        );
        const oldSecondaryBeneficiary = await Staking.beneficiary(
            oldSecondary,
            programId
        );

        const newPrimaryBeneficiary = await Staking.beneficiary(
            newPrimary,
            programId
        );
        const newSecondaryBeneficiary = await Staking.beneficiary(
            newSecondary,
            programId
        );
        const keys: AccountMeta[] = [
            am(funder, true, true),
            am(endpoint, false, true),
            am(owner, false, false),
            am(ownerSigner, true, false),
            am(oldPrimaryBeneficiary, false, true),
            am(oldSecondaryBeneficiary, false, true),
            am(newPrimary, false, false),
            am(newPrimaryBeneficiary, false, true),
            am(newSecondary, false, false),
            am(newSecondaryBeneficiary, false, true),
            am(settingsId, false, true),
            am(SYSVAR_RENT_PUBKEY, false, false),
            am(SYSVAR_CLOCK_PUBKEY, false, false),
            am(SystemProgram.programId, false, false)
        ];

        const instruction = new SimpleSchema({
            instructionId: Instructions.ChangeBeneficiaries
        });
        const instructionData = borsh.serialize(
            INSTRUCTION_SCHEMA,
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

export function decodeInstructionData(data: Buffer): InstructionSchema {
    switch (data[0]) {
        case Instructions.Initialize:
            return borsh.deserialize(INSTRUCTION_SCHEMA, InitSchema, data);
        case Instructions.Stake:
            return borsh.deserialize(INSTRUCTION_SCHEMA, AmountSchema, data);
        case Instructions.RegisterEndpoint: // fallthrough intentional
        case Instructions.TransferEndpoint:
            return borsh.deserialize(INSTRUCTION_SCHEMA, AuthoritySchema, data);
        default:
            return borsh.deserialize(INSTRUCTION_SCHEMA, SimpleSchema, data);
    }
}

export const INSTRUCTION_SCHEMA: borsh.Schema = new Map<any, any>([
    [
        SimpleSchema,
        {
            kind: 'struct',
            fields: [['instructionId', 'u8']]
        }
    ],
    [
        AmountSchema,
        {
            kind: 'struct',
            fields: [
                ['instructionId', 'u8'],
                ['amount', 'BigInt']
            ]
        }
    ],
    [
        InitSchema,
        {
            kind: 'struct',
            fields: [
                ['instructionId', 'u8'],
                ['startTime', 'Date'],
                ['unbondingDuration', 'u64']
            ]
        }
    ],
    [
        AuthoritySchema,
        {
            kind: 'struct',
            fields: [
                ['instructionId', 'u8'],
                ['authority', 'Authority']
            ]
        }
    ]
]);
