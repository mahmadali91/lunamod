// Демо-каталог: 20 категорий × 5 товаров.
// [название, артикул-префикс, силуэт, [цена от, до], тип размеров]
const C = {
  black: ['Чёрный', '#1f2937'], white: ['Белый', '#f1f5f9'], beige: ['Бежевый', '#d6c3a5'], grey: ['Серый', '#9ca3af'],
  navy: ['Тёмно-синий', '#1e3a5f'], blue: ['Синий', '#3b6fd8'], denim: ['Голубой деним', '#6b8db8'], darkdenim: ['Тёмный деним', '#2f4a6d'],
  khaki: ['Хаки', '#7a7f4f'], burgundy: ['Бордовый', '#7f1d2d'], pink: ['Розовый', '#f4a6c8'], powder: ['Пудровый', '#e8c4c4'],
  olive: ['Оливковый', '#6b7a3a'], brown: ['Коричневый', '#7c4a2d'], green: ['Зелёный', '#2f855a'], milk: ['Молочный', '#efe6d2'],
  lavender: ['Лавандовый', '#b9a7e0'], mustard: ['Горчичный', '#c99a2e'], red: ['Красный', '#d64545'], camel: ['Кэмел', '#b88a57'],
  mint: ['Мятный', '#8fd3b6'], sky: ['Голубой', '#8cc3f0'], graphite: ['Графит', '#4b5563'], terracotta: ['Терракотовый', '#c4673f'],
};

const SZ = { cloth: ['XS', 'S', 'M', 'L', 'XL'], jeans: ['26', '27', '28', '29', '30', '31', '32'], one: ['Единый'] };

const CATEGORIES = [
  { name: 'Брюки', code: 'BR', items: [
    ['Брюки классические со стрелками', { kind: 'pants', crease: true, out: 132, inn: 184 }, [3990, 6990], 'cloth', ['black', 'graphite', 'navy'], 'Полиэстер, вискоза'],
    ['Брюки карго', { kind: 'pants', cargo: true, out: 124, inn: 186 }, [3490, 5490], 'cloth', ['khaki', 'olive', 'black'], 'Хлопок 100%'],
    ['Брюки чинос', { kind: 'pants', out: 134, inn: 184 }, [3290, 4990], 'cloth', ['beige', 'navy', 'olive'], 'Хлопок, эластан'],
    ['Брюки палаццо', { kind: 'pants', out: 104, inn: 194, hem: 340 }, [3990, 5990], 'cloth', ['milk', 'terracotta', 'black'], 'Вискоза'],
    ['Брюки кюлоты', { kind: 'pants', out: 112, inn: 192, hem: 290 }, [3490, 4990], 'cloth', ['camel', 'grey'], 'Лён, вискоза'],
  ] },
  { name: 'Джинсы', code: 'JN', items: [
    ['Джинсы скинни', { kind: 'pants', denim: true, out: 142, inn: 180 }, [3490, 5490], 'jeans', ['darkdenim', 'black', 'denim'], 'Хлопок 98%, эластан 2%'],
    ['Джинсы мом', { kind: 'pants', denim: true, out: 128, inn: 184, hem: 320 }, [3990, 5990], 'jeans', ['denim', 'sky'], 'Хлопок 100%'],
    ['Джинсы бойфренды', { kind: 'pants', denim: true, out: 122, inn: 188, hem: 325 }, [3990, 5490], 'jeans', ['denim', 'darkdenim'], 'Хлопок 100%'],
    ['Джинсы клеш', { kind: 'pants', denim: true, out: 140, inn: 180, flare: 24 }, [4290, 6490], 'jeans', ['darkdenim', 'denim'], 'Хлопок 99%, эластан 1%'],
    ['Джинсы прямые', { kind: 'pants', denim: true, out: 132, inn: 184 }, [3790, 5790], 'jeans', ['denim', 'black'], 'Хлопок 100%'],
  ] },
  { name: 'Шорты', code: 'SH', items: [
    ['Шорты бермуды', { kind: 'pants', short: true, hem: 225, out: 120, inn: 186 }, [2290, 3490], 'cloth', ['beige', 'navy', 'khaki'], 'Хлопок, лён'],
    ['Шорты спортивные', { kind: 'pants', short: true, hem: 195, out: 118, inn: 188 }, [1490, 2490], 'cloth', ['black', 'grey', 'blue'], 'Полиэстер'],
    ['Шорты джинсовые', { kind: 'pants', short: true, denim: true, hem: 190, out: 120, inn: 188 }, [1990, 2990], 'jeans', ['denim', 'sky'], 'Хлопок 100%'],
    ['Шорты льняные', { kind: 'pants', short: true, hem: 205, out: 118, inn: 188 }, [2190, 3290], 'cloth', ['milk', 'olive'], 'Лён 100%'],
    ['Шорты велосипедки', { kind: 'pants', short: true, tight: true, hem: 215, out: 144, inn: 182 }, [990, 1690], 'cloth', ['black', 'graphite'], 'Хлопок, эластан'],
  ] },
  { name: 'Юбки', code: 'SK', items: [
    ['Юбка мини', { kind: 'skirt', shape: 'a', hem: 210 }, [1990, 2990], 'cloth', ['black', 'pink', 'denim'], 'Хлопок'],
    ['Юбка миди', { kind: 'skirt', shape: 'flare', hem: 290 }, [2990, 4490], 'cloth', ['mustard', 'olive', 'milk'], 'Вискоза'],
    ['Юбка макси', { kind: 'skirt', shape: 'maxi', hem: 355 }, [3490, 4990], 'cloth', ['terracotta', 'black'], 'Вискоза, полиэстер'],
    ['Юбка-карандаш', { kind: 'skirt', shape: 'pencil', hem: 290 }, [2790, 3990], 'cloth', ['black', 'graphite', 'burgundy'], 'Полиэстер, эластан'],
    ['Юбка плиссе', { kind: 'skirt', shape: 'pleat', hem: 300 }, [3290, 4790], 'cloth', ['powder', 'navy', 'lavender'], 'Полиэстер'],
  ] },
  { name: 'Леггинсы, тайтсы, лосины', code: 'LG', items: [
    ['Леггинсы базовые', { kind: 'pants', tight: true, out: 146, inn: 182 }, [1290, 1990], 'cloth', ['black', 'graphite'], 'Хлопок 95%, эластан 5%'],
    ['Тайтсы спортивные', { kind: 'pants', tight: true, out: 146, inn: 182, hem: 320 }, [1990, 2990], 'cloth', ['black', 'navy', 'burgundy'], 'Полиамид, эластан'],
    ['Лосины утеплённые', { kind: 'pants', tight: true, out: 144, inn: 182 }, [1490, 2290], 'cloth', ['black', 'brown'], 'Хлопок, начёс'],
    ['Леггинсы с высокой посадкой', { kind: 'pants', tight: true, y: 82, out: 146, inn: 182 }, [1690, 2490], 'cloth', ['graphite', 'olive'], 'Полиамид, эластан'],
    ['Лосины в рубчик', { kind: 'pants', tight: true, out: 146, inn: 182, pattern: 'stripes' }, [1590, 2390], 'cloth', ['milk', 'mint'], 'Хлопок, эластан'],
  ] },
  { name: 'Платья и сарафаны', code: 'DR', items: [
    ['Платье вечернее', { kind: 'dress', hem: 360, fit: false }, [6990, 12990], 'cloth', ['burgundy', 'black', 'navy'], 'Атлас'],
    ['Платье повседневное', { kind: 'dress', sleeve: 'short', hem: 320 }, [2990, 4490], 'cloth', ['sky', 'mustard', 'mint'], 'Хлопок', 'dots'],
    ['Платье-футляр', { kind: 'dress', fit: true, strap: false, hem: 300 }, [4490, 6990], 'cloth', ['black', 'red', 'graphite'], 'Полиэстер, эластан'],
    ['Сарафан летний', { kind: 'dress', hem: 330 }, [2490, 3990], 'cloth', ['milk', 'pink', 'mint'], 'Лён, хлопок'],
    ['Платье-рубашка', { kind: 'top', sleeve: 'long', neck: 'collar', hem: 340, flare: true, belt: true }, [3990, 5490], 'cloth', ['khaki', 'denim', 'beige'], 'Хлопок'],
  ] },
  { name: 'Рубашки, блузки, туники', code: 'RB', items: [
    ['Рубашка оверсайз', { kind: 'top', sleeve: 'long', neck: 'collar', hem: 295 }, [2490, 3990], 'cloth', ['white', 'sky', 'beige'], 'Хлопок 100%'],
    ['Рубашка в полоску', { kind: 'top', sleeve: 'long', neck: 'collar', hem: 290, pattern: 'stripes' }, [2690, 3990], 'cloth', ['blue', 'navy'], 'Хлопок'],
    ['Блузка шёлковая', { kind: 'top', sleeve: 'long', neck: 'v', hem: 270 }, [3490, 5490], 'cloth', ['milk', 'powder', 'black'], 'Шёлк, вискоза'],
    ['Блузка с коротким рукавом', { kind: 'top', sleeve: 'short', neck: 'v', hem: 265 }, [1990, 2990], 'cloth', ['white', 'lavender'], 'Вискоза'],
    ['Туника льняная', { kind: 'top', sleeve: 'short', neck: 'v', hem: 330, flare: true }, [2490, 3490], 'cloth', ['milk', 'olive', 'sky'], 'Лён 100%'],
  ] },
  { name: 'Футболки, майки, поло, топы', code: 'TS', items: [
    ['Футболка базовая', { kind: 'top', sleeve: 'short', neck: 'crew' }, [990, 1590], 'cloth', ['white', 'black', 'grey', 'navy'], 'Хлопок 100%'],
    ['Футболка оверсайз', { kind: 'top', sleeve: 'short', neck: 'crew', hem: 300 }, [1290, 1990], 'cloth', ['milk', 'graphite', 'mint'], 'Хлопок 100%'],
    ['Майка', { kind: 'top', sleeve: null, neck: 'crew', hem: 285 }, [690, 1190], 'cloth', ['white', 'black'], 'Хлопок, эластан'],
    ['Поло', { kind: 'top', sleeve: 'short', neck: 'collar', polo: true, hem: 285 }, [1990, 2990], 'cloth', ['navy', 'white', 'green'], 'Хлопок пике'],
    ['Топ укороченный', { kind: 'top', sleeve: 'cap', neck: 'crew', hem: 215 }, [890, 1490], 'cloth', ['pink', 'black', 'lavender'], 'Хлопок, эластан'],
  ] },
  { name: 'Кофты, кардиганы, джемперы, пуловеры', code: 'KF', items: [
    ['Кардиган на пуговицах', { kind: 'top', sleeve: 'long', neck: 'v', open: true, ribs: true, hem: 300 }, [2990, 4490], 'cloth', ['camel', 'milk', 'grey'], 'Акрил, шерсть'],
    ['Кардиган удлинённый', { kind: 'top', sleeve: 'long', neck: 'v', open: true, ribs: true, hem: 345 }, [3490, 4990], 'cloth', ['beige', 'graphite'], 'Шерсть 30%, акрил 70%'],
    ['Джемпер базовый', { kind: 'top', sleeve: 'long', neck: 'crew', ribs: true }, [2490, 3490], 'cloth', ['navy', 'burgundy', 'grey'], 'Хлопок, акрил'],
    ['Пуловер с V-вырезом', { kind: 'top', sleeve: 'long', neck: 'v', ribs: true }, [2690, 3790], 'cloth', ['green', 'navy', 'beige'], 'Шерсть мериноса'],
    ['Кофта на молнии', { kind: 'top', sleeve: 'long', neck: 'crew', open: true, ribs: true }, [2290, 3290], 'cloth', ['grey', 'black'], 'Хлопок, полиэстер'],
  ] },
  { name: 'Свитеры, водолазки', code: 'SV', items: [
    ['Свитер крупной вязки', { kind: 'top', sleeve: 'long', neck: 'crew', ribs: true, hem: 295, pattern: 'stripes' }, [3490, 5490], 'cloth', ['milk', 'mustard', 'grey'], 'Шерсть, акрил'],
    ['Свитер оверсайз', { kind: 'top', sleeve: 'long', neck: 'crew', ribs: true, hem: 300 }, [3290, 4790], 'cloth', ['beige', 'lavender', 'graphite'], 'Акрил, мохер'],
    ['Водолазка базовая', { kind: 'top', sleeve: 'long', neck: 'turtle', hem: 280 }, [1490, 2290], 'cloth', ['black', 'white', 'brown'], 'Вискоза, эластан'],
    ['Водолазка в рубчик', { kind: 'top', sleeve: 'long', neck: 'turtle', hem: 280, pattern: 'stripes' }, [1690, 2490], 'cloth', ['milk', 'graphite'], 'Хлопок, эластан'],
    ['Свитер с горлом', { kind: 'top', sleeve: 'long', neck: 'turtle', ribs: true, hem: 295 }, [3490, 4990], 'cloth', ['camel', 'navy'], 'Шерсть мериноса'],
  ] },
  { name: 'Худи, свитшоты, толстовки', code: 'HD', items: [
    ['Худи оверсайз', { kind: 'top', sleeve: 'long', neck: 'hood', pocket: true, ribs: true, hem: 300 }, [2990, 4290], 'cloth', ['grey', 'black', 'lavender'], 'Хлопок, футер с начёсом'],
    ['Худи на молнии', { kind: 'top', sleeve: 'long', neck: 'hood', open: true, ribs: true }, [3290, 4490], 'cloth', ['navy', 'graphite'], 'Хлопок, полиэстер'],
    ['Свитшот базовый', { kind: 'top', sleeve: 'long', neck: 'crew', ribs: true }, [1990, 2990], 'cloth', ['mint', 'grey', 'black'], 'Хлопок, футер'],
    ['Свитшот с принтом', { kind: 'top', sleeve: 'long', neck: 'crew', ribs: true, pattern: 'dots' }, [2290, 3290], 'cloth', ['milk', 'pink'], 'Хлопок, футер'],
    ['Толстовка спортивная', { kind: 'top', sleeve: 'long', neck: 'hood', pocket: true, ribs: true }, [2490, 3490], 'cloth', ['blue', 'black', 'red'], 'Хлопок, полиэстер'],
  ] },
  { name: 'Пиджаки, жакеты, блейзеры', code: 'PJ', items: [
    ['Пиджак классический', { kind: 'top', sleeve: 'long', neck: 'lapel', hem: 300 }, [5990, 8990], 'cloth', ['black', 'navy', 'graphite'], 'Шерсть, полиэстер'],
    ['Блейзер оверсайз', { kind: 'top', sleeve: 'long', neck: 'lapel', hem: 315 }, [5490, 7990], 'cloth', ['beige', 'camel', 'black'], 'Полиэстер, вискоза'],
    ['Жакет укороченный', { kind: 'top', sleeve: 'long', neck: 'lapel', hem: 250 }, [4490, 6490], 'cloth', ['milk', 'pink'], 'Твид'],
    ['Пиджак льняной', { kind: 'top', sleeve: 'long', neck: 'lapel', hem: 300 }, [4990, 6990], 'cloth', ['olive', 'milk'], 'Лён 100%'],
    ['Блейзер в клетку', { kind: 'top', sleeve: 'long', neck: 'lapel', hem: 300, pattern: 'stripes' }, [5990, 7990], 'cloth', ['brown', 'grey'], 'Шерсть 50%'],
  ] },
  { name: 'Жилеты костюмные', code: 'JL', items: [
    ['Жилет костюмный классический', { kind: 'top', sleeve: null, neck: 'v', open: true, hem: 270 }, [2490, 3490], 'cloth', ['black', 'graphite', 'navy'], 'Шерсть, полиэстер'],
    ['Жилет удлинённый', { kind: 'top', sleeve: null, neck: 'v', open: true, hem: 330 }, [2990, 3990], 'cloth', ['beige', 'camel'], 'Полиэстер, вискоза'],
    ['Жилет приталенный', { kind: 'top', sleeve: null, neck: 'v', open: true, hem: 255 }, [2290, 3290], 'cloth', ['burgundy', 'black'], 'Полиэстер'],
    ['Жилет в полоску', { kind: 'top', sleeve: null, neck: 'v', open: true, hem: 270, pattern: 'stripes' }, [2690, 3690], 'cloth', ['grey', 'navy'], 'Шерсть 40%'],
    ['Жилет льняной', { kind: 'top', sleeve: null, neck: 'v', open: true, hem: 265 }, [2190, 3190], 'cloth', ['milk', 'olive'], 'Лён'],
  ] },
  { name: 'Костюмы', code: 'KS', items: [
    ['Костюм брючный', { kind: 'set', top: { sleeve: 'long', neck: 'lapel', hem: 300 }, pants: { crease: true } }, [8990, 13990], 'cloth', ['black', 'beige', 'navy'], 'Полиэстер, вискоза'],
    ['Костюм юбочный', { kind: 'set', top: { sleeve: 'long', neck: 'lapel', hem: 270 }, pants: { short: true, hem: 220, out: 130, inn: 186 } }, [7990, 11990], 'cloth', ['pink', 'milk'], 'Твид'],
    ['Костюм-тройка', { kind: 'set', top: { sleeve: 'long', neck: 'lapel', hem: 300, tie: '#7f1d2d' }, pants: { crease: true } }, [12990, 18990], 'cloth', ['graphite', 'navy'], 'Шерсть 70%'],
    ['Костюм спортивный', { kind: 'set', top: { sleeve: 'long', neck: 'hood', pocket: true, ribs: true }, pants: { out: 132, inn: 184 } }, [4490, 6490], 'cloth', ['grey', 'black', 'navy'], 'Хлопок, футер'],
    ['Костюм льняной', { kind: 'set', top: { sleeve: 'short', neck: 'collar', hem: 280 }, pants: { out: 126, inn: 188 } }, [6490, 8990], 'cloth', ['milk', 'olive'], 'Лён 100%'],
  ] },
  { name: 'Комбинезоны и полукомбинезоны', code: 'KM', items: [
    ['Комбинезон джинсовый', { kind: 'jumpsuit' }, [4490, 6490], 'cloth', ['denim', 'darkdenim'], 'Хлопок 100%'],
    ['Полукомбинезон', { kind: 'jumpsuit' }, [3990, 5490], 'cloth', ['khaki', 'black'], 'Хлопок'],
    ['Комбинезон летний', { kind: 'jumpsuit', flare: 14 }, [3490, 4990], 'cloth', ['terracotta', 'mint'], 'Вискоза'],
    ['Комбинезон вечерний', { kind: 'jumpsuit', flare: 22 }, [6990, 9990], 'cloth', ['black', 'burgundy'], 'Креп'],
    ['Комбинезон утеплённый', { kind: 'jumpsuit' }, [5990, 8990], 'cloth', ['graphite', 'olive'], 'Полиэстер, утеплитель'],
  ] },
  { name: 'Боди', code: 'BD', items: [
    ['Боди с длинным рукавом', { kind: 'body', sleeve: 'long', neck: 'crew' }, [1490, 2290], 'cloth', ['black', 'white', 'beige'], 'Вискоза, эластан'],
    ['Боди на бретелях', { kind: 'body', sleeve: null, neck: 'crew' }, [1190, 1790], 'cloth', ['black', 'powder'], 'Хлопок, эластан'],
    ['Боди с V-вырезом', { kind: 'body', sleeve: 'long', neck: 'v' }, [1690, 2490], 'cloth', ['burgundy', 'milk'], 'Вискоза'],
    ['Боди-водолазка', { kind: 'body', sleeve: 'long', neck: 'turtle' }, [1790, 2590], 'cloth', ['black', 'graphite'], 'Вискоза, эластан'],
    ['Боди с коротким рукавом', { kind: 'body', sleeve: 'short', neck: 'crew' }, [1290, 1990], 'cloth', ['white', 'mint'], 'Хлопок'],
  ] },
  { name: 'Халаты', code: 'HL', items: [
    ['Халат махровый', { kind: 'top', sleeve: 'long', neck: 'v', hem: 355, belt: true, flare: true, ribs: true }, [2990, 4490], 'cloth', ['white', 'grey', 'sky'], 'Хлопок 100%, махра'],
    ['Халат шёлковый', { kind: 'top', sleeve: 'long', neck: 'v', hem: 345, belt: true, flare: true }, [3990, 5990], 'cloth', ['powder', 'black', 'burgundy'], 'Шёлк'],
    ['Халат домашний', { kind: 'top', sleeve: 'long', neck: 'v', hem: 340, belt: true, flare: true, pattern: 'dots' }, [1990, 2990], 'cloth', ['lavender', 'mint'], 'Хлопок'],
    ['Халат вафельный', { kind: 'top', sleeve: 'long', neck: 'v', hem: 345, belt: true, flare: true, pattern: 'stripes' }, [2290, 3290], 'cloth', ['milk', 'grey'], 'Хлопок, вафельное полотно'],
    ['Халат короткий', { kind: 'top', sleeve: 'short', neck: 'v', hem: 290, belt: true, flare: true }, [1790, 2690], 'cloth', ['pink', 'sky'], 'Вискоза'],
  ] },
  { name: 'Пижамы', code: 'PZ', items: [
    ['Пижама с брюками', { kind: 'set', top: { sleeve: 'long', neck: 'collar', hem: 280 }, pants: {}, pattern: 'dots' }, [2490, 3990], 'cloth', ['navy', 'pink', 'sky'], 'Хлопок'],
    ['Пижама с шортами', { kind: 'set', top: { sleeve: 'short', neck: 'collar', hem: 270 }, pants: { short: true, hem: 200, out: 118, inn: 188 } }, [1990, 2990], 'cloth', ['mint', 'powder'], 'Хлопок'],
    ['Пижама шёлковая', { kind: 'set', top: { sleeve: 'long', neck: 'collar', hem: 280 }, pants: {} }, [4490, 6490], 'cloth', ['burgundy', 'milk', 'black'], 'Шёлк'],
    ['Пижама фланелевая', { kind: 'set', top: { sleeve: 'long', neck: 'collar', hem: 280 }, pants: {}, pattern: 'stripes' }, [2790, 3790], 'cloth', ['red', 'green'], 'Фланель'],
    ['Пижама с футболкой', { kind: 'set', top: { sleeve: 'short', neck: 'crew' }, pants: {} }, [1990, 2790], 'cloth', ['grey', 'lavender'], 'Хлопок, трикотаж'],
  ] },
  { name: 'Ночные сорочки, рубашки для сна', code: 'NS', items: [
    ['Сорочка ночная шёлковая', { kind: 'dress', slip: true, hem: 330 }, [2490, 3990], 'cloth', ['powder', 'black', 'milk'], 'Шёлк'],
    ['Сорочка с кружевом', { kind: 'dress', slip: true, hem: 300 }, [1990, 2990], 'cloth', ['white', 'lavender'], 'Вискоза, кружево'],
    ['Рубашка для сна', { kind: 'top', sleeve: 'long', neck: 'collar', hem: 340, flare: true }, [1990, 2990], 'cloth', ['sky', 'white'], 'Хлопок'],
    ['Сорочка хлопковая', { kind: 'dress', sleeve: 'short', hem: 330 }, [1490, 2290], 'cloth', ['mint', 'pink'], 'Хлопок 100%', 'dots'],
    ['Сорочка длинная', { kind: 'dress', slip: true, hem: 360 }, [2290, 3290], 'cloth', ['burgundy', 'navy'], 'Сатин'],
  ] },
  { name: 'Домашние костюмы', code: 'DK', items: [
    ['Домашний костюм с брюками', { kind: 'set', top: { sleeve: 'long', neck: 'crew', ribs: true }, pants: { out: 130, inn: 186 } }, [2990, 4490], 'cloth', ['grey', 'lavender', 'beige'], 'Хлопок, трикотаж'],
    ['Домашний костюм с шортами', { kind: 'set', top: { sleeve: 'short', neck: 'crew' }, pants: { short: true, hem: 200, out: 118, inn: 188 } }, [1990, 2990], 'cloth', ['mint', 'pink'], 'Хлопок'],
    ['Домашний костюм велюровый', { kind: 'set', top: { sleeve: 'long', neck: 'hood', open: true, ribs: true }, pants: { out: 130, inn: 186 } }, [3990, 5490], 'cloth', ['burgundy', 'graphite', 'powder'], 'Велюр'],
    ['Домашний костюм в рубчик', { kind: 'set', top: { sleeve: 'long', neck: 'v', open: true }, pants: { out: 128, inn: 186 }, pattern: 'stripes' }, [2790, 3990], 'cloth', ['milk', 'olive'], 'Хлопок, эластан'],
    ['Домашний костюм флисовый', { kind: 'set', top: { sleeve: 'long', neck: 'crew', ribs: true }, pants: { out: 130, inn: 186 } }, [2490, 3490], 'cloth', ['navy', 'brown'], 'Флис'],
  ] },
];

module.exports = { CATEGORIES, COLORS: C, SIZES: SZ };
