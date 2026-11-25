# 1.6 的美术清单

`docs/plan-1.6.md` 的 F1、F2、F3 要加的图，都记在这里，写法照 `docs/art-1.4.md`：每张图从哪个素材包拼出来，还是手画，由哪个脚本做。素材包和授权见 `docs/art.md`。

`tests/art-sources.test.ts` 把这份清单和 1.4 的那份一起读。1.3 以后 `assets/sprites/` 里新加的图，要在其中一份清单上。

## 清点的结果

2026-11-25 为面包房清点过一次，素材包是 `assets/vendor/` 里装着的那几份。

- **面包房拼得出来，面包也有。** Modern Interiors 的 `16_Grocery_store` 有工业烤箱、双层烤箱、摆满面包的烘焙架、面包托盘、羊角包、长棍面包和不锈钢台子。Modern Farm 有石头烤炉、烤好的面包、两种装面包的木盆、空篮子、麻袋和木铲。`3_Animated_objects` 有和面机。
- **所以 Q-F10 的前提不成立。** 计划里说素材包没有面包，清点下来是有的。面包房只手画了一样东西：柜台上的玻璃面包柜。价目写在每间店都有的那块黑板上，用粉笔线手画。
- **邮局也拼得出来。** Modern Exteriors 的 `22_Post_Office` 有邮筒、大小包裹和信件。包里的邮筒是红的，脚本把邮筒染成绿色，跟家门口的一样。手画的是柜台、分信格、墙上的软木板、包裹架和黑板上的邮资。
- **伞不用再画。** F3 清点时发现街上已经有一把手画的伞：D6 下雨天给出门跑腿的人打的那把（`scripts/art/decor.py`，在 `town-decor.png` 里）。行人用的就是这把，Q-F10 说的伞没有新画。
- **行人用人物生成器拼。** `2_Characters` 的现成角色是 48×48 的，跟店里的人不是一个尺寸。行人照店员的办法，用 `Character_Generator` 的身体、衣服和发型拼出十个，只留站和走两行。
- **故事留下的东西手画。** F4 桂姨和阿信各讲五章，每章留一件小东西挂在自己店的墙上。素材包里没有面包模子、老面罐、旧车票、赊账本、编成环的面包、旧邮包、扎信的红绳、信封小框、旧围巾和纪念章这样的小件，十件都用 `scripts/art/tales.py` 逐个像素画，跟 D4 街上那十五件一个画法。

看过的：Modern Interiors 的 `12_Kitchen`、`16_Grocery_store` 两张主题图；Modern Exteriors 的 `22_Post_Office` 单图；Modern Farm 的单图按文件名查过；`3_Animated_objects` 里名字带 kitchen、oven、fridge、kneader 的几张。

## 清单

| 产出 | 用在 | 出处 | 脚本 |
|---|---|---|---|
| `bakery.png` | F1 面包房内景 | Modern Interiors：`Room_Builder` 的地砖和墙，`16_Grocery_store` 的双层烤箱、烘焙架、不锈钢台子、羊角包，`2_LivingRoom` 的盆栽；Modern Farm 的面包、面包盆、篮子、麻袋；`3_Animated_objects` 的和面机；手画的玻璃面包柜和黑板上的价目 | `scripts/art/bakery.py` |
| `bakery-room.png` | F1 面包房，家具后面那层 | Modern Interiors，同 `bakery.png` | `scripts/art/pieces.py` |
| `bakery-pieces.png` | F1 面包房，家具前面那层 | Modern Interiors，同 `bakery.png` | `scripts/art/pieces.py` |
| `guiyi.png` | F1 桂姨当店主时的行走图，和客人桂姨同一套搭配 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `cook.png` | F1 面馆的老马，菜单带来的客人 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `lodger.png` | F1 楼上的小林，食谱带来的客人 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `grow-bakery-wheat.png` | F1 面包房墙上长出来的一束麦穗 | 手画 | `scripts/art/growth.py` |
| `grow-bakery-ivy.png` | F1 面包房墙上长出来的吊着的绿萝 | 手画 | `scripts/art/growth.py` |
| `grow-bakery-pin.png` | F1 面包房墙上长出来的擀面杖 | 手画 | `scripts/art/growth.py` |
| `grow-bakery-garland.png` | F1 面包房墙上长出来的一串小面包 | 手画 | `scripts/art/growth.py` |
| `grow-chalkboard.png` | F1 做过菜单，主店左墙边立着的小黑板（F2 从挂钟底下挪过来） | 手画 | `scripts/art/growth.py` |
| `grow-cookbook.png` | F1 写过食谱，主店文件柜上的食谱本 | 手画 | `scripts/art/growth.py` |
| `post.png` | F2 邮局内景 | Modern Interiors：`Room_Builder` 的地砖和墙，`16_Grocery_store` 的不锈钢台子；Modern Exteriors：`22_Post_Office` 的邮筒、包裹和信件；手画的柜台、分信格、软木板、包裹架和黑板上的邮资 | `scripts/art/post.py` |
| `post-room.png` | F2 邮局，家具后面那层 | Modern Interiors 和 Modern Exteriors，同 `post.png` | `scripts/art/pieces.py` |
| `post-pieces.png` | F2 邮局，家具前面那层 | Modern Interiors 和 Modern Exteriors，同 `post.png` | `scripts/art/pieces.py` |
| `axin.png` | F2 阿信当店主时的行走图，和客人阿信同一套搭配 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `florist.png` | F2 花店的芳姐，贺卡带来的客人 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `organizer.png` | F2 居委会的吴阿姨，简报带来的客人 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `grow-post-stamp.png` | F2 邮局墙上裱起来的第一张邮票 | 手画 | `scripts/art/growth.py` |
| `grow-post-ivy.png` | F2 邮局墙上吊着的绿萝 | 手画 | `scripts/art/growth.py` |
| `grow-post-horn.png` | F2 邮局墙上的铜邮号 | 手画 | `scripts/art/growth.py` |
| `grow-post-map.png` | F2 邮局墙上的送信路线图 | 手画 | `scripts/art/growth.py` |
| `grow-cardline.png` | F2 做过贺卡，主店侧窗上挂的一串贺卡 | 手画 | `scripts/art/growth.py` |
| `grow-newsletters.png` | F2 做过简报，主店窗台上的一摞简报 | 手画 | `scripts/art/growth.py` |
| `passer-1.png` | F3 街上的行人，十个里的第一个，只有站和走 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `passer-2.png` | F3 街上的行人 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `passer-3.png` | F3 街上的行人 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `passer-4.png` | F3 街上的行人 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `passer-5.png` | F3 街上的行人 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `passer-6.png` | F3 街上的行人 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `passer-7.png` | F3 街上的行人 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `passer-8.png` | F3 街上的行人 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `passer-9.png` | F3 街上的行人 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `passer-10.png` | F3 街上的行人 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `tale-tin.png` | F4 桂姨第 1 章，面包房墙上的旧面包模子 | 手画 | `scripts/art/tales.py` |
| `tale-starter.png` | F4 桂姨第 2 章，烤炉上方小架子上的老面罐 | 手画 | `scripts/art/tales.py` |
| `tale-ticket.png` | F4 桂姨第 3 章，钉在墙上的旧车票 | 手画 | `scripts/art/tales.py` |
| `tale-ledger.png` | F4 桂姨第 4 章，挂在窗边的赊账本 | 手画 | `scripts/art/tales.py` |
| `tale-plait.png` | F4 桂姨第 5 章，编成环的大面包 | 手画 | `scripts/art/tales.py` |
| `tale-satchel.png` | F4 阿信第 1 章，邮局墙上的旧邮包 | 手画 | `scripts/art/tales.py` |
| `tale-bundle.png` | F4 阿信第 2 章，红绳扎好的一小捆信 | 手画 | `scripts/art/tales.py` |
| `tale-envelope.png` | F4 阿信第 3 章，小框里没写门牌的信封 | 手画 | `scripts/art/tales.py` |
| `tale-scarf.png` | F4 阿信第 4 章，钩子上的旧围巾 | 手画 | `scripts/art/tales.py` |
| `tale-badge.png` | F4 阿信第 5 章，送信二十年的纪念章 | 手画 | `scripts/art/tales.py` |

`shops-decor.png` 多了一行面包房，挂的是一块大饼干，节日的图案用糖霜画在上面。F2 又多了一行邮局，挂的是一个航空信封，节日画在信封正面（`scripts/art/decor.py`）。`town.json` 里面包房门口也有了花盆、店招和彩旗，店招上画的是一个面包；邮局的店招上是一个信封（`scripts/art/town.py`）。这两张图 1.4 的清单里已经有了。F4 桂姨和阿信在自家门口等着讲故事，等的位置加在 `town-story.json` 里，`town-story.png` 没有变（`scripts/art/story.py`）。`assets/ui/portraits.png` 多了桂姨和阿信的头像（`scripts/art/portraits.py`），它不在 `assets/sprites/` 里。
