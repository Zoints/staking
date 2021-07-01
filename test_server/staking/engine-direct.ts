import { sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import { Instruction, ZERO_KEY } from '@zoints/staking';
import { App } from './app';
import { AppCommunity, AppStaker } from './community';
import { StakeEngine } from './engine';

export class EngineDirect implements StakeEngine {
    async registerCommunity(
        app: App,
        community: AppCommunity,
        noSecondary: boolean
    ): Promise<void> {
        const transaction = new Transaction().add(
            await Instruction.RegisterCommunity(
                app.program_id,
                app.funder.publicKey,
                community.authority.publicKey,
                community.key.publicKey,
                community.primaryAuthority.publicKey,
                noSecondary ? ZERO_KEY : community.secondaryAuthority.publicKey
            )
        );

        const sig = await sendAndConfirmTransaction(
            app.connection,
            transaction,
            [app.funder, community.authority, community.key]
        );

        console.log(
            `Added community ${
                community.id
            }: ${community.key.publicKey.toBase58()}: ${sig}`
        );
    }

    async claim(
        app: App,
        community: AppCommunity,
        primary: boolean
    ): Promise<void> {
        const authority = primary
            ? community.primaryAuthority
            : community.secondaryAuthority;

        const assoc = await app.token.getOrCreateAssociatedAccountInfo(
            authority.publicKey
        );

        const instruction = primary
            ? Instruction.ClaimPrimary
            : Instruction.ClaimSecondary;
        const trans = new Transaction();
        trans.add(
            await instruction(
                app.program_id,
                app.funder.publicKey,
                authority.publicKey,
                assoc.address,
                community.key.publicKey,
                app.mint_id.publicKey
            )
        );
        const sig = await sendAndConfirmTransaction(app.connection, trans, [
            app.funder,
            authority
        ]);

        console.log(
            `Claimed Primary=${primary} Harvest ${community.key.publicKey.toBase58()}: ${sig}`
        );
    }

    async stake(
        app: App,
        community: AppCommunity,
        staker: AppStaker,
        amount: number
    ): Promise<void> {
        const assoc = await app.token.getOrCreateAssociatedAccountInfo(
            staker.key.publicKey
        );
        const trans = new Transaction();

        try {
            await app.staking.getStakeWithoutId(
                community.key.publicKey,
                staker.key.publicKey
            );
        } catch (e) {
            trans.add(
                await Instruction.InitializeStake(
                    app.program_id,
                    app.funder.publicKey,
                    staker.key.publicKey,
                    community.key.publicKey
                )
            );
        }

        trans.add(
            await Instruction.Stake(
                app.program_id,
                app.funder.publicKey,
                staker.key.publicKey,
                assoc.address,
                community.key.publicKey,
                app.mint_id.publicKey,
                amount
            )
        );
        const sig = await sendAndConfirmTransaction(app.connection, trans, [
            app.funder,
            staker.key
        ]);

        console.log(`Staked: ${sig}`);
    }

    async withdraw(
        app: App,
        community: AppCommunity,
        staker: AppStaker
    ): Promise<void> {
        const assoc = await app.token.getOrCreateAssociatedAccountInfo(
            staker.key.publicKey
        );
        const trans = new Transaction();
        trans.add(
            await Instruction.WithdrawUnbond(
                app.program_id,
                app.funder.publicKey,
                staker.key.publicKey,
                assoc.address,
                community.key.publicKey
            )
        );
        const sig = await sendAndConfirmTransaction(app.connection, trans, [
            app.funder,
            staker.key
        ]);

        console.log(
            `Withdraw Unbond ${community.key.publicKey.toBase58()}: ${sig}`
        );
    }
}
