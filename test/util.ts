import {
    Connection,
    Transaction,
    Signer,
    ConfirmOptions,
    TransactionSignature
} from '@solana/web3.js';

/**
 * Sign, send and confirm a transaction.
 *
 * If `commitment` option is not specified, defaults to 'max' commitment.
 *
 * @param {Connection} connection
 * @param {Transaction} transaction
 * @param {Array<Signer>} signers
 * @param {ConfirmOptions} [options]
 * @returns {Promise<TransactionSignature>}
 */
export async function sendAndConfirmTransaction(
    connection: Connection,
    transaction: Transaction,
    signers: Array<Signer>,
    options?: ConfirmOptions
): Promise<TransactionSignature> {
    const sendOptions = options && {
        skipPreflight: options.skipPreflight,
        preflightCommitment: options.preflightCommitment || options.commitment
    };

    const signature = await connection.sendTransaction(
        transaction,
        signers,
        sendOptions
    );
    console.log(`Transaction sent ${signature}`);

    const status = (
        await connection.confirmTransaction(
            signature,
            options && options.commitment
        )
    ).value;

    if (status.err) {
        throw new Error(
            `Transaction ${signature} failed (${JSON.stringify(status)})`
        );
    }

    return signature;
}
