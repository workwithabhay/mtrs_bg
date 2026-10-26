import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../modules/users/user.model.js';
import { logger } from '../common/utils/logger.js';

/**
 * Controlled Server-Side Super Admin Provisioning Script.
 * Usage:
 *   npx tsx src/scripts/seed-admin.ts --email=admin@example.com --name="Super Admin"
 * Or via env:
 *   SUPER_ADMIN_EMAIL=admin@example.com SUPER_ADMIN_NAME="Super Admin" npx tsx src/scripts/seed-admin.ts
 */
export async function seedSuperAdmin(email?: string, name?: string): Promise<void> {
  const adminEmail = (email || process.env.SUPER_ADMIN_EMAIL || getArg('--email'))
    ?.trim()
    .toLowerCase();

  const adminName = (
    name ||
    process.env.SUPER_ADMIN_NAME ||
    getArg('--name') ||
    'Super Admin'
  )?.trim();

  if (!adminEmail || !adminEmail.includes('@')) {
    console.error(
      '❌ Error: A valid email address is required. Use --email=<email> or set SUPER_ADMIN_EMAIL.',
    );
    process.exit(1);
  }

  try {
    await connectDatabase();

    const existingUser = await User.findOne({ email: adminEmail });

    if (existingUser) {
      existingUser.role = 'super_admin';
      existingUser.status = 'active';
      existingUser.isEmailVerified = true;
      if (adminName) existingUser.name = adminName;
      await existingUser.save();

      logger.info(
        { email: adminEmail, userId: existingUser._id },
        'Successfully promoted existing user to Super Admin',
      );
    } else {
      const newUser = await User.create({
        email: adminEmail,
        name: adminName,
        role: 'super_admin',
        status: 'active',
        isEmailVerified: true,
      });

      logger.info(
        { email: adminEmail, userId: newUser._id },
        'Successfully provisioned new Super Admin user',
      );
    }
  } catch (error) {
    console.error('❌ Failed to provision Super Admin:', error);
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
}

function getArg(flag: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (arg) {
    return arg.split('=')[1];
  }
  const index = process.argv.indexOf(flag);
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return undefined;
}

// Run directly if invoked via CLI
if (process.argv[1]?.endsWith('seed-admin.ts') || process.argv[1]?.endsWith('seed-admin.js')) {
  seedSuperAdmin();
}
