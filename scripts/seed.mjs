import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const sampleMedia = [
  {
    id: 'sample-1',
    name: 'Nature Forest 4K.mp4',
    mimeType: 'video/mp4',
    size: BigInt(25480000),
    thumbnailUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80',
    createdTime: new Date('2026-09-20T10:00:00Z'),
    modifiedTime: new Date('2026-09-20T10:00:00Z'),
    width: 3840,
    height: 2160,
    durationMillis: BigInt(45000), // 45s
    driveFolderId: 'demo-folder',
  },
  {
    id: 'sample-2',
    name: 'Alpine Mountain Sunrise.jpg',
    mimeType: 'image/jpeg',
    size: BigInt(4850000),
    thumbnailUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
    createdTime: new Date('2026-09-15T08:30:00Z'),
    modifiedTime: new Date('2026-09-15T08:30:00Z'),
    width: 4000,
    height: 3000,
    driveFolderId: 'demo-folder',
  },
  {
    id: 'sample-3',
    name: 'Cyberpunk Neon Cityscape.jpg',
    mimeType: 'image/jpeg',
    size: BigInt(6210000),
    thumbnailUrl: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=1200&q=80',
    createdTime: new Date('2026-08-28T19:45:00Z'),
    modifiedTime: new Date('2026-08-28T19:45:00Z'),
    width: 3840,
    height: 2400,
    driveFolderId: 'demo-folder',
  },
  {
    id: 'sample-4',
    name: 'Deep Blue Ocean Waves.mp4',
    mimeType: 'video/mp4',
    size: BigInt(42100000),
    thumbnailUrl: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=1200&q=80',
    createdTime: new Date('2026-08-14T14:15:00Z'),
    modifiedTime: new Date('2026-08-14T14:15:00Z'),
    width: 1920,
    height: 1080,
    durationMillis: BigInt(62000), // 1m 02s
    driveFolderId: 'demo-folder',
  },
  {
    id: 'sample-5',
    name: 'Architecture Modern Minimal.jpg',
    mimeType: 'image/jpeg',
    size: BigInt(3400000),
    thumbnailUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80',
    createdTime: new Date('2026-07-22T11:20:00Z'),
    modifiedTime: new Date('2026-07-22T11:20:00Z'),
    width: 3000,
    height: 2000,
    driveFolderId: 'demo-folder',
  },
  {
    id: 'sample-6',
    name: 'Northern Lights Aurora.jpg',
    mimeType: 'image/jpeg',
    size: BigInt(5120000),
    thumbnailUrl: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=1200&q=80',
    createdTime: new Date('2026-07-05T23:10:00Z'),
    modifiedTime: new Date('2026-07-05T23:10:00Z'),
    width: 4200,
    height: 2800,
    driveFolderId: 'demo-folder',
  },
];

async function main() {
  console.log('Seeding initial media demo items into dev.db...');
  for (const item of sampleMedia) {
    await prisma.driveFile.upsert({
      where: { id: item.id },
      create: item,
      update: item,
    });
  }
  console.log(`Seeded ${sampleMedia.length} demo media records successfully.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
