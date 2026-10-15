// Разовые обновления данных при запуске сервера (каждое — один раз, отметка в настройках).
const prisma = require('./db');

// v2.4: «как на WB» — у каждой расцветки своя карточка (артикул, фото), размеры внутри карточки,
// карточки одной модели объединены в группу. Карточки v2.3 с несколькими цветами разносим по отдельным карточкам.
async function splitColors() {
  const parents = await prisma.product.findMany({ where: { hasVariants: true, parentId: null }, include: { variants: true, images: true, attributes: true } });
  for (const p of parents) {
    const colors = [...new Set(p.variants.map((v) => v.color).filter(Boolean))];
    if (!colors.length) continue;
    if (colors.length === 1) { if (!p.color) await prisma.product.update({ where: { id: p.id }, data: { color: colors[0] } }); continue; }
    await prisma.$transaction(async (tx) => {
      const group = p.groupId ? { id: p.groupId } : await tx.productGroup.create({ data: {} });
      await tx.product.update({ where: { id: p.id }, data: { groupId: group.id, color: colors[0] } });
      for (const [i, c] of colors.slice(1).entries()) {
        let sku = p.sku ? `${p.sku}-${i + 2}` : null;
        if (sku && (await tx.product.findUnique({ where: { sku } }))) sku = null;
        const card = await tx.product.create({ data: {
          name: p.name, sku, description: p.description, unit: p.unit, price: p.price, oldPrice: p.oldPrice, costPrice: p.costPrice, minStock: p.minStock,
          weight: p.weight, categoryId: p.categoryId, active: p.active, showInShop: p.showInShop, hasVariants: true, groupId: group.id, color: c,
          brand: p.brand, slug: p.slug, modelInfo: p.modelInfo, sizeChartId: p.sizeChartId,
          attributes: { create: p.attributes.map((a) => ({ name: a.name, value: a.value })) },
        } });
        await tx.product.updateMany({ where: { parentId: p.id, color: c }, data: { parentId: card.id } });
        await tx.productImage.updateMany({ where: { productId: p.id, color: c }, data: { productId: card.id } });
        const common = p.images.filter((im) => !im.color);
        if (common.length) await tx.productImage.createMany({ data: common.map((im) => ({ productId: card.id, path: im.path, kind: im.kind, sort: im.sort })) });
      }
    }, { timeout: 60000 });
  }
}

const STEPS = [['upgrade_color_cards', splitColors]];

async function runUpgrades() {
  for (const [key, fn] of STEPS) {
    try {
      if (await prisma.setting.findUnique({ where: { key } })) continue;
      await fn();
      await prisma.setting.create({ data: { key, value: new Date().toISOString() } });
    } catch (e) { console.error('upgrade', key, e.message); }
  }
}

module.exports = { runUpgrades };
