import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { BinaryReader, BinaryWriter } from 'borsh';
declare module 'borsh' {
    interface BinaryWriter {
        writeI64(value: bigint): void;
        writePublicKey(value: PublicKey): void;
        writeDate(value: Date): void;
    }
    interface BinaryReader {
        readI64(): BN;
        readPublicKey(): PublicKey;
        readDate(): Date;
    }
}

BinaryWriter.prototype.writeI64 = function (value: bigint) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64LE(value);
    this.writeFixedArray(buffer);
};

BinaryReader.prototype.readI64 = function () {
    return new BN(this.readFixedArray(8), 'le');
};

BinaryWriter.prototype.writePublicKey = function (value: PublicKey) {
    this.writeFixedArray(value.toBuffer());
};

BinaryReader.prototype.readPublicKey = function () {
    return new PublicKey(this.readFixedArray(32));
};

BinaryWriter.prototype.writeDate = function (value: Date) {
    this.writeU64(value.getUnixTime());
};

BinaryReader.prototype.readDate = function () {
    return new Date(this.readU64().toNumber() * 1000);
};
