import mongoose from 'mongoose';

/** Estado de conexión de Mongoose: 1 = conectado. */
export function isDbUp(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function connectDb(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
