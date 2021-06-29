# TODO

* Change community accounts to program accounts to stop injection of malicious accounts?

# Staking Outline

Unbonding Time: 10 days

## Program Global Accounts:

### Settings
* Token (the "ZEE" SPL token mint)
* Authority
* Sponsor Fee (in ZEE)

### SPL Address for Token
* Staking slush fund for withdrawals (ZEE)

## Stakeholder Side:
### Stakeholder Account of person A for community C has:
* Creation Date
* Stake Amount
* Last action time
* Unclaimed Rewards balance
* Unbonding Time
* Unbonding balance

### Adding or Withdrawing Stake Amount
1. Specify amount in ZEE
2. Calculate the elapsed stake periods since the last action
3. Credit the unclaimed rewards that have accrued since 2.
4. Update stake amount (credit or deduct from 1.)
5. Update last action time
6. [Community Account] Calculate the elapsed stake periods since the last action
7. [Community Account] Credit the unclaimed rewards that have accrued since 6. for primary and secondary
8. [Community Account] Update total stake amount
9. [Community Account] Update last action time
10. If decreasing stake, transfer difference to unbonding balance and update unbonding time

### Withdrawing rewards:
1. Calculate the elapsed stake periods since the last action time
2. Credit the unclaimed rewards that have accrued since 1.
3. Update last action time
4. Withdraw unclaimed rewards balance from slush fund
### Withdrawing unbonding funds:
1. Check the unbonding time to see if enough time has elapsed
2. If yes, transfer unbonding balance from znbonding account

## Community Account of Community C:
* Creation Date
* Total Stake Amount
* Last action time
* Primary Account Beneficiary Address
* Primary Account Authorized Key
* Primary Account Perecentage (45)
* Primary Account Unclaimed Rewards Balance
* Secondary Account Authorized Key
* Secondary Account Perecentage (10)
* Secondary Account Unclaimed Rewards Balance
* Referrer (User Community only)

For user communities, the primary account has the user as authorized key, and the user's zee address as beneficiary. The secondary account is the sponsor. If no sponsor exists, the secondary percentage is zero.
For Z/Communities, the primary account is the community treasury, with the secondary account being the owner.

### Withdrawing rewards (Primary):
1. Calculate the elapsed stake periods since the last action time for both primary and secondary
2. Credit the unclaimed rewards that have accrued since 1. for both primary and secondary
3. Update last action time
4. Withdraw primary unclaimed rewards balance from slush fund to the beneficiary address
### Withdrawing rewards (Secondary):
1. Calculate the elapsed stake periods since the last action time for both primary and secondary
2. Credit the unclaimed rewards that have accrued since 1. for both primary and secondary
3. Update last action time
4. Withdraw secondary unclaimed rewards balance from slush fund

## Sponsoring

To sponsor a user community, anyone can call the instruction to donate the "Sponsor Fee" to the primary account beneficiary address. Within 48 hours of creation, only the referrer may perform the action. If a sponsor already exists, you can't sponsor again.

1. Send an amount equal to the Sponsor Fee to the Primary Account
2. Update Secondary Account Authorized Key to the caller
3. Update Secondary Account Percentage to 5