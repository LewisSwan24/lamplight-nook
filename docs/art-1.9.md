# 1.9 的美术清单

`docs/plan-1.9.md` 各包要加的图记在这里，写法照 `docs/art-1.6.md`：每张图从哪个素材包拼出来，还是手画，由哪个脚本做。素材包和授权见 `docs/art.md`。

`tests/art-sources.test.ts` 把这份清单和 1.4、1.6、1.7、1.8 的四份一起读。

## 清单

| 产出 | 用在 | 出处 | 脚本 |
|---|---|---|---|
| `keepsakes.png` | I1 八位店员故事留下的 24 件东西，一格 16×16，画在故事卡和小本子的故事页上 | 手画 | `scripts/art/keepsakes.py` |
| `xiaodou-2.png` | I2 小豆上手以后的行走图：还是那件绿衬衫，腰上系一条帆布围裙，围裙取自阿灯那套衣服 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `xiaodou-3.png` | I2 小豆出师以后的行走图：换一身棕色外套配白衬衫，发型不变 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `shop-dog.png` | I3 面包房的狗馒头：站、叫、抬头、趴睡四行，一格 32×32 | Modern Farm：`Animals_16x16/Dogs` 的橘色巴森吉 | `scripts/art/animals.py` |
| `pigeon.png` | I3 邮局的鸽子邮票：朝左朝右站着、朝左朝右飞四行，一格 32×32，乌鸦染成鸽子灰，脖子一圈绿 | Modern Exteriors：`Animated_16x16` 的乌鸦 | `scripts/art/animals.py` |
| `fishbowl.png` | I3 画室的金鱼朱砂：窗台上的圆鱼缸，一格 16×16，12 帧游一个来回。素材包的游鱼是水下的影子，放不进小鱼缸，所以手画 | 手画 | `scripts/art/animals.py` |
