import mongoose from "mongoose";
import { createInterface } from "node:readline/promises";
import { User, ensureIndexes } from "../src/models.js";
import { passwordHash, audit } from "../src/security.js";
import { email, password } from "../src/validation.js";
if (!process.env.MONGODB_URI) throw Error("MONGODB_URI is required.");
const input = createInterface({ input: process.stdin, output: process.stdout });
try {
  const address = email.parse(
    process.env.BOOTSTRAP_ADMIN_EMAIL ||
      (await input.question("Admin email: ")),
  );
  const name =
    process.env.BOOTSTRAP_ADMIN_NAME || (await input.question("Admin name: "));
  // Supply the password through an environment variable, never a command argument.
  const pass = password.parse(process.env.BOOTSTRAP_ADMIN_PASSWORD);
  await mongoose.connect(process.env.MONGODB_URI);
  await ensureIndexes();
  if (await User.exists({ role: "admin" }))
    throw Error(
      "An administrator already exists. This bootstrap command will not change existing access.",
    );
  if (await User.exists({ email: address }))
    throw Error(
      "This email already has an account. Bootstrap requires a new address.",
    );
  const user = await User.create({
    name,
    email: address,
    passwordHash: await passwordHash(pass),
    role: "admin",
    verified: true,
  });
  await audit(user, "admin.bootstrapped", user.id);
  console.info(
    "Administrator created. Sign in and enable your authenticator in Account settings.",
  );
} finally {
  input.close();
  await mongoose.disconnect();
}
