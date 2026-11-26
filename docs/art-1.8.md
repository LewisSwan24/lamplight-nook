# 1.8 的美术清单

`docs/plan-1.8.md` 各包要加的图记在这里，写法照 `docs/art-1.6.md`：每张图从哪个素材包拼出来，还是手画，由哪个脚本做。素材包和授权见 `docs/art.md`。

`tests/art-sources.test.ts` 把这份清单和 1.4、1.6、1.7 的三份一起读。

## 改了的旧图

这几张在前面的清单上，1.8 只是往里加东西，出处没变：

- `works.png`（H1）：作品架的图标后面加了一格复习卡片，一张白卡片压在一张米色卡片前面，`scripts/art/growth.py` 手画的。
- `pieces.json`（H1）：记下了复习卡片那一叠在哪儿，好让人点。顺手重做时，简报那一摞的位置也改对了：F2 把简报挪到了窗台上，`pieces.json` 里记的还是大桌上的旧位置。
- `works.png`（H5）：再加一格家庭账本，一张米色、红色、绿色三块的饼图，`scripts/art/growth.py` 手画的。
- `pieces.json`（H5）：记下了印刷铺柜台上那本账簿在哪儿。账簿画在柜台上面一层，站在柜台后面的人看起来在账簿后头。

## 清单

| 产出 | 用在 | 出处 | 脚本 |
|---|---|---|---|
| `grow-cardstack.png` | H1 做过复习卡片，主店书架顶上一叠用皮筋扎着的卡片 | 手画 | `scripts/art/growth.py` |
| `pupil.png` | H1 复习卡片带来的客人乐乐，一个要考试的中学生 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `grow-print-ledgerbook.png` | H5 做过家庭账本，印刷铺柜台上一本摊开的账簿。跟街上铺子自己的四件一样手画，放进仓库 | 手画 | `scripts/art/growth.py` |
| `bookkeeper.png` | H5 家庭账本带来的客人秦阿姨，社区里管家里账的阿姨 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `grow-workshop-arcade.png` | H2 做过小游戏，工坊墙上一块搁板，上面放一台蓝色的小游戏机。手画，放进仓库 | 手画 | `scripts/art/growth.py` |
| `dad.png` | H2 小游戏带来的客人朵朵爸，想给女儿做个游戏的爸爸，戴一顶蓝色鸭舌帽 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
