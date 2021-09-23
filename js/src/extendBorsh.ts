import { PublicKey } from '@solana/web3.js';
import { BinaryReader, BinaryWriter } from 'borsh';
declare module 'borsh' {
    interface BinaryWriter {
        writeBigInt(value: bigint): void;
        writePublicKey(value: PublicKey): void;
        writeDate(value: Date): void;
    }
    interface BinaryReader {
        readBigInt(): bigint;
        readPublicKey(): PublicKey;
        readDate(): Date;
    }
}

BinaryWriter.prototype.writeBigInt = function (value: bigint) {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64LE(value);
    this.writeFixedArray(buf);
};

BinaryReader.prototype.readBigInt = function () {
    const buf = Buffer.from(this.readFixedArray(8));
    return buf.readBigInt64LE();
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
