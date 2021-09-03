import {
    Keypair,
    sendAndConfirmTransaction,
    Transaction
} from '@solana/web3.js';
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
            [app.funder, community.key]
        );

        console.log(
            `Added community ${
                community.id
            }: ${community.key.publicKey.toBase58()}: ${sig}`
        );
    }

    async claim(app: App, authority?: Keypair): Promise<void> {
        if (authority === undefined) {
            authority = app.fee_authority;
        }
        const assoc = await app.token.getOrCreateAssociatedAccountInfo(
            authority.publicKey
        );
        const trans = new Transaction().add(
            await Instruction.Claim(
                app.program_id,
                app.funder.publicKey,
                authority.publicKey,
                assoc.address
            )
        );
        const sig = await sendAndConfirmTransaction(app.connection, trans, [
            app.funder,
            authority
        ]);

        console.log(
            `Claimed Harvest ${authority.publicKey.toBase58()}: ${sig}`
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
                    community.key.publicKey,
                    app.mint_id.publicKey
                )
            );
        }

        const comm = await app.staking.getCommunity(community.key.publicKey);

        trans.add(
            await Instruction.Stake(
                app.program_id,
                app.funder.publicKey,
                staker.key.publicKey,
                assoc.address,
                community.key.publicKey,
                app.fee_authority.publicKey,
                comm.primary,
                comm.secondary,
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
        staker: AppStaker,
        communities: AppCommunity[]
    ): Promise<void> {
        for (const community of communities) {
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
}
