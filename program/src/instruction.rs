use borsh::{BorshDeserialize, BorshSerialize};

#[repr(C)]
#[derive(Clone, Debug, PartialEq, BorshSerialize, BorshDeserialize)]
pub enum StakingInstruction {
    Initialize,
    RegisterCommunity,
    InitializeStake,
    Stake { amount: u64 },
    Unstake { amount: u64 },
    WithdrawUnbond,
    ClaimPrimary,
    ClaimSecondary,
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
