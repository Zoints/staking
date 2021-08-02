use borsh::{BorshDeserialize, BorshSerialize};

#[repr(C)]
#[derive(Clone, Debug, PartialEq, BorshSerialize, BorshDeserialize)]
pub enum StakingInstruction {
    /// Initialize the program after deploying it for the first time.
    ///
    /// Expected Accounts:
    ///     1. `[writable,signer]` Transaction payer
    ///     2. `[writable]` Settings account
    ///     3. `[]` Pool Authority
    ///     4. `[writable]` Stake Pool
    ///     5. `[writable]` Reward Pool
    ///     6. `[]` ZEE Token Mint
    ///     7. `[signer]` Fee Recipient Authority
    ///     8. `[]` Rent Sysvar
    ///     9. `[]` SPL Token Program
    ///     10. `[]` System Program
    Initialize {
        /// The time after which yields start to pay out
        start_time: i64,
        /// The amount of time (in seconds) to lock unbonded funds
        unbonding_duration: u64,
    },
    /// Register a new community.
    ///
    /// Expected Accounts:
    ///     1. `[writable,signer]` Transaction payer
    ///     2. `[]` Community Owner
    ///     3. `[writable]` Community Account
    ///     4. `[]` Primary Beneficiary Authority
    ///     5. `[]` Secondary Beneficiary Authority
    ///     6. `[]` Rent Sysvar
    ///     7. `[]` Clock Sysvar
    ///     8. `[]` System Program
    RegisterCommunity,
    /*
        const keys: AccountMeta[] = [
        am(funder, true, true),
        am(owner, true, false),
        am(community, false, true),
        am(stakeId, false, true),
        am(SYSVAR_RENT_PUBKEY, false, false),
        am(SYSVAR_CLOCK_PUBKEY, false, false),
        am(SystemProgram.programId, false, false)
    ];
    */
    /// Initialize a new stake
    ///
    /// Must be done before being able to stake ZEE to a community
    ///
    /// Expected Accounts:
    ///     1. `[writable,signer]` Transaction payer
    ///     2. `[signer]` Staker
    ///     3. `[writable]` Community Account
    ///     4. `[writable]` Stake Account
    ///     5. `[]` Rent Sysvar
    ///     6. `[]` Clock Sysvar
    ///     7. `[]` System Program
    InitializeStake,
    /// Stake ZEE
    ///
    /// To withdraw, you can stake negative amount. To just harvest yield, you
    /// can stake zero. Unless everything is withdrawn at the same time, there
    /// must always be at least 1000 ZEE staked.
    ///
    /// Expected Accounts:
    ///     1. `[writable,signer]` Transaction payer
    ///     2. `[signer]` Staker
    ///     3. `[writable]` Staker's ZEE Token Account
    ///     4. `[writable]` Community
    ///     5. `[]` Pool Authority
    ///     6. `[writable]` Stake Pool
    ///     7. `[writable]` Reward Pool
    ///     8. `[writable]` Settings
    ///     9. `[writable]` Stake Account
    ///     10. `[]` Clock Sysvar
    ///     11. `[]` SPL Token Program
    Stake { amount: i64 },
    /// Withdraw Unbounded Tokens
    ///
    /// Transfer the unbounded tokens to a wallet once the duration has passed.
    ///
    /// Expected Accounts:
    ///     1. `[writable,signer]` Transaction payer
    ///     2. `[signer]` Staker
    ///     3. `[writable]` Staker's ZEE Token Account
    ///     4. `[]` Community
    ///     5. `[]` Settings
    ///     6. `[]` Pool Authority
    ///     7. `[writable]` Stake Pool
    ///     8. `[writable]` Stake Account
    ///     9. `[]` Clock Sysvar
    ///     10. `[]` SPL Token Program
    WithdrawUnbond,
    /// Claim Primary Yield
    ///
    /// Expected Accounts:
    ///     1. `[writable,signer]` Transaction payer
    ///     2. `[signer]` Primary Authority
    ///     3. `[writable]` Authority's ZEE Token Account
    ///     4. `[writable]` Community
    ///     5. `[writable]` Settings
    ///     6. `[]` Pool Authority
    ///     7. `[writable]` Reward Pool
    ///     8. `[]` Clock Sysvar
    ///     9. `[]` SPL Token Program
    ClaimPrimary,
    /// Claim Secondary Yield
    ///
    /// Expected Accounts:
    ///     1. `[writable,signer]` Transaction payer
    ///     2. `[signer]` Secondary Authority
    ///     3. `[writable]` Authority's ZEE Token Account
    ///     4. `[writable]` Community
    ///     5. `[writable]` Settings
    ///     6. `[]` Pool Authority
    ///     7. `[writable]` Reward Pool
    ///     8. `[]` Clock Sysvar
    ///     9. `[]` SPL Token Program
    ClaimSecondary,
    /// Claim Global Fee
    ///
    /// Expected Accounts:
    ///     1. `[writable,signer]` Transaction payer
    ///     2. `[]` Fee Authority
    ///     3. `[writable]` Authority's ZEE Token Account
    ///     4. `[writable]` Settings
    ///     5. `[]` Pool Authority
    ///     6. `[writable]` Reward Pool
    ///     7. `[]` Clock Sysvar
    ///     8. `[]` SPL Token Program
    ClaimFee,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    pub fn test_serialize() {
        let amount = 12345;
        let init = StakingInstruction::Stake { amount };
        let data = init.try_to_vec().unwrap();

        let mut should = vec![0];
        should.extend(amount.to_le_bytes().iter());

        assert_eq!(data, should);
    }
}
