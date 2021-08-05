export enum StakingErrors {
    MissingAuthoritySignature,
    ProgramAlreadyInitialized,
    ProgramNotInitialized,
    InvalidSettingsAccount,
    InvalidRewardPoolAccount,
    InvalidPoolAuthorityAccount,
    TokenNotSPLToken,
    CommunityAccountAlreadyExists,
    InvalidStakeAccount,
    InvalidStakeFundAccount,
    InvalidCommunityAccount,
    MissingStakeSignature,
    AssociatedInvalidOwner,
    AssociatedInvalidToken,
    AssociatedInvalidAccount,
    StakerInvalidStakeAccount,
    StakerBalanceTooLow,
    StakerMinimumBalanceNotMet,
    StakerWithdrawingTooMuch,
    WithdrawNothingtowithdraw,
    WithdrawUnbondingTimeNotOverYet,
    InvalidBeneficiaryAccount,
    InvalidToken
}

const custom = /custom program error: 0x([0-9a-fA-F]+)/;

export function parseError(err: Error): Error {
    const match = err.message.match(custom);
    if (match) {
        const errorId = parseInt(match[1], 16);
        err.message = err.message.replace(
            match[0],
            `STAKING-ERROR 0x${match[1]}: ${StakingErrors[errorId]}`
        );
    }
    return err;
}
