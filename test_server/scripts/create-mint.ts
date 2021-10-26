/*
Test the creation of a mint, which seems to fail in 1.7/1.8
*/

import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    MintLayout,
    Token,
    TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import {
    clusterApiUrl,
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    sendAndConfirmTransaction,
    SystemProgram,
    Transaction
} from '@solana/web3.js';

const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

(async () => {
    const funder = Keypair.fromSeed(
        Buffer.from([
            1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0
        ])
    );
    const mint = new Keypair();
    const mintAuthority = new Keypair();

    const airdrop = await connection.requestAirdrop(
        funder.publicKey,
        LAMPORTS_PER_SOL * 1
    );
    await connection.confirmTransaction(airdrop);

    const balanceNeeded = await Token.getMinBalanceRentForExemptMint(
        connection
    );

    const trans = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: funder.publicKey,
            newAccountPubkey: mint.publicKey,
            lamports: balanceNeeded,
            space: MintLayout.span,
            programId: TOKEN_PROGRAM_ID
        }),
        Token.createInitMintInstruction(
            TOKEN_PROGRAM_ID,
            mint.publicKey,
            0,
            mintAuthority.publicKey,
            null
        )
    );

    console.log(
        await sendAndConfirmTransaction(connection, trans, [funder, mint])
    );
})().then(() => process.exit(0));
