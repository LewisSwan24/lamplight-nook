# 1.6 的美术清单

`docs/plan-1.6.md` 的 F1、F2、F3 要加的图，都记在这里，写法照 `docs/art-1.4.md`：每张图从哪个素材包拼出来，还是手画，由哪个脚本做。素材包和授权见 `docs/art.md`。

`tests/art-sources.test.ts` 把这份清单和 1.4 的那份一起读。1.3 以后 `assets/sprites/` 里新加的图，要在其中一份清单上。

## 清点的结果

2026-11-25 为面包房清点过一次，素材包是 `assets/vendor/` 里装着的那几份。

- **面包房拼得出来，面包也有。** Modern Interiors 的 `16_Grocery_store` 有工业烤箱、双层烤箱、摆满面包的烘焙架、面包托盘、羊角包、长棍面包和不锈钢台子。Modern Farm 有石头烤炉、烤好的面包、两种装面包的木盆、空篮子、麻袋和木铲。`3_Animated_objects` 有和面机。
- **所以 Q-F10 的前提不成立。** 计划里说素材包没有面包，清点下来是有的。面包房只手画了一样东西：柜台上的玻璃面包柜。价目写在每间店都有的那块黑板上，用粉笔线手画。
- **伞还没清点，** 留给 F3。

看过的：Modern Interiors 的 `12_Kitchen`、`16_Grocery_store` 两张主题图；Modern Farm 的单图按文件名查过；`3_Animated_objects` 里名字带 kitchen、oven、fridge、kneader 的几张。

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
| `grow-chalkboard.png` | F1 做过菜单，主店墙上挂的小黑板 | 手画 | `scripts/art/growth.py` |
| `grow-cookbook.png` | F1 写过食谱，主店文件柜上的食谱本 | 手画 | `scripts/art/growth.py` |

`shops-decor.png` 多了一行面包房，挂的是一块大饼干，节日的图案用糖霜画在上面（`scripts/art/decor.py`）。`town.json` 里面包房门口也有了花盆、店招和彩旗，店招上画的是一个面包（`scripts/art/town.py`）。这两张图 1.4 的清单里已经有了。`assets/ui/portraits.png` 多了一行桂姨的头像（`scripts/art/portraits.py`），它不在 `assets/sprites/` 里。
