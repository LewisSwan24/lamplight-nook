# 1.4 的美术清单

`docs/road-to-1.4.md` 的 D9。1.4 要加的每张图都在下面的清单里，写着从哪个素材包拼出来，还是手画。素材包和授权见 `docs/art.md`。

`tests/art-sources.test.ts` 照着清单查三件事。每一行都要有出处和脚本。1.3 以后 `assets/sprites/` 里新加的图都要在清单上。已经做出来的图，脚本里要写着这张图的文件名。1.3 时有哪些图，记在 `tests/fixtures/sprites-1.3.txt`。

## 清点的结果

2026-11-20 清点，素材包是 `assets/vendor/` 里装着的那几份。

- **画室拼得出来。** Modern Interiors 的 `7_Art` 主题有画架、颜料桶、画布、画框、调色板、高凳和长桌。
- **工坊拼得出来。** Modern Farm 有 DIY 和木工两种工作台，带锤子、锯子、刷子、颜料罐。Modern Interiors 的 `1_Generic` 有挂在墙上的工具和一张放电脑的桌子。
- **印刷铺只拼得出一半。** 桌子、柜子、纸箱、文件架都有。看过的主题里没有印刷机，也没有铅字架，这两样手画，照 C8 资料室的做法。
- **街道拼得出来。** Modern Exteriors 有模块化的楼面、普通楼房、邮局、商场的橱窗，跑腿时窗口里那条小街也是这么拼的（`scripts/art/street.py`）。路灯、长椅、花盆、树、公交站牌在 `3_City_Props`。
- **小镇长出来的东西拼得出来。** 集市摊在 `9_Shopping_Center_and_Markets`，喷泉和花坛在 `17_Garden`。
- **季节和节日一半手画。** 南瓜在 `19_Graveyard`，圣诞的东西在 `15_Christmas`。素材包里没有雪景，雪地和屋顶积雪手画。灯笼、粽子摊、月饼摊照 `scripts/art/decor.py` 现有的画法手画。
- **自行车没有。** 老周故事里那辆旧自行车手画。
- **店招的字手画。** 用 `scripts/art/font.py` 的像素字。

所以 Q-D2 的三间店不用换。手画的东西有五样：印刷机和铅字架、雪、灯笼一类的节日小摊、自行车、店招的字。都和 C8 的小件差不多大。

看过的：Modern Interiors 的 `7_Art`、`1_Generic`、`13_Conference_Hall`、`14_Basement` 四张主题图；Modern Exteriors 和 Modern Farm 的单图按文件名查过。没看的：Modern Interiors 另外二十二个主题。这些主题的单图只有编号，没有名字。

## 清单

新店员的文件名在 D2 定下名字以后跟着改。

| 产出 | 用在 | 出处 | 脚本 |
|---|---|---|---|
| `town-street.png` | D1 街面、人行道、马路 | Modern Exteriors：`2_City_Terrains`、`1_Terrains_and_Fences` | `scripts/art/town.py` |
| `town-fronts.png` | D1 七个门面 | Modern Exteriors：`5_Floor_Modular_Buildings`、`4_Generic_Buildings`、`22_Post_Office`、`9_Shopping_Center_and_Markets` 的橱窗 | `scripts/art/town.py` |
| `town-props.png` | D1 路灯、长椅、花盆、树、站牌 | Modern Exteriors：`3_City_Props` | `scripts/art/town.py` |
| `town-signs.png` | D1 七块店招 | 手画，字用像素字 | `scripts/art/town.py` |
| `town.json` | D1 门面、门和街上小件的位置，游戏和测试都读它 | Modern Exteriors，跟街景一起算出来 | `scripts/art/town.py` |
| `print.png` | D2 印刷铺内景 | Modern Interiors：`Room_Builder` 的地板和墙，`7_Art` 的长桌，`1_Generic` 的小桌，`2_LivingRoom` 的盆栽；手画的印刷机、排字台和铅字架、纸架、压书板 | `scripts/art/print.py` |
| `print-room.png` | D2 印刷铺，家具后面那层 | Modern Interiors，同 `print.png` | `scripts/art/pieces.py` |
| `print-pieces.png` | D2 印刷铺，家具前面那层 | Modern Interiors，同 `print.png` | `scripts/art/pieces.py` |
| `studio.png` | D2 画室内景 | Modern Interiors：`Room_Builder`，`7_Art` 的画架、颜料、长桌、陶罐、画框、调色板，`14_Basement` 的高凳；手画的颜料架和晾画的绳 | `scripts/art/studio.py` |
| `studio-room.png` | D2 画室，家具后面那层 | Modern Interiors，同 `studio.png` | `scripts/art/pieces.py` |
| `studio-pieces.png` | D2 画室，家具前面那层 | Modern Interiors，同 `studio.png` | `scripts/art/pieces.py` |
| `workshop.png` | D2 工坊内景 | Modern Farm：DIY 工作台，DIY 和木工台上的工具；Modern Interiors：`Room_Builder`，`1_Generic` 的墙上工具和纸箱，`5_Classroom_and_library` 的旧电脑桌，`14_Basement` 的桌子；手画的洞洞板和零件柜 | `scripts/art/workshop.py` |
| `workshop-room.png` | D2 工坊，家具后面那层 | Modern Farm 和 Modern Interiors，同 `workshop.png` | `scripts/art/pieces.py` |
| `workshop-pieces.png` | D2 工坊，家具前面那层 | Modern Farm 和 Modern Interiors，同 `workshop.png` | `scripts/art/pieces.py` |
| `aqian.png` | D2 印刷铺的店员阿铅 | Modern Interiors：`2_Characters` 的人物生成器 | `scripts/art/characters.py` |
| `xiaozhe.png` | D2 画室的店员小赭 | Modern Interiors：`2_Characters` 的人物生成器 | `scripts/art/characters.py` |
| `xiaoding.png` | D2 工坊的店员小钉 | Modern Interiors：`2_Characters` 的人物生成器 | `scripts/art/characters.py` |
| `town-grow.png` | D5 街上长出来的路灯、长椅、大花盆、推车、小公园、喷泉；门口的花盆、新招牌和小旗 | Modern Exteriors：`3_City_Props` 的路灯、长椅、树、花丛、喷泉和花盆，`17_Garden` 的推车和大花盆；手画的招牌和小旗 | `scripts/art/town.py` |
| `grow-print-proof.png` | D5 印刷铺墙上长出来的第一张印样 | 手画 | `scripts/art/growth.py` |
| `grow-print-ivy.png` | D5 印刷铺墙上长出来的吊着的绿萝 | 手画 | `scripts/art/growth.py` |
| `grow-print-typecase.png` | D5 印刷铺墙上长出来的铅字盘 | 手画 | `scripts/art/growth.py` |
| `grow-print-ribbon.png` | D5 印刷铺墙上长出来的奖状 | 手画 | `scripts/art/growth.py` |
| `grow-studio-sketch.png` | D5 画室墙上长出来的第一张画稿 | 手画 | `scripts/art/growth.py` |
| `grow-studio-ivy.png` | D5 画室墙上长出来的吊着的绿萝 | 手画 | `scripts/art/growth.py` |
| `grow-studio-palette.png` | D5 画室墙上长出来的调色板 | 手画 | `scripts/art/growth.py` |
| `grow-studio-gallery.png` | D5 画室墙上长出来的一墙小画 | 手画 | `scripts/art/growth.py` |
| `grow-workshop-gear.png` | D5 工坊墙上长出来的框起来的齿轮 | 手画 | `scripts/art/growth.py` |
| `grow-workshop-ivy.png` | D5 工坊墙上长出来的吊着的绿萝 | 手画 | `scripts/art/growth.py` |
| `grow-workshop-clock.png` | D5 工坊墙上长出来的挂钟 | 手画 | `scripts/art/growth.py` |
| `grow-workshop-blueprint.png` | D5 工坊墙上长出来的图纸 | 手画 | `scripts/art/growth.py` |
| `town-decor.png` | D6 街上的四季、六个节日、水洼和积雪，跑腿的人撑的伞 | Modern Exteriors：`19_Graveyard` 的南瓜灯；Modern Interiors：`15_Christmas` 的圣诞树，`11_Halloween` 的南瓜堆；手画的雪、落叶、花、树荫、水洼、灯笼、花环、灯谜、粽子摊、月饼摊和伞 | `scripts/art/decor.py` |
| `town-decor.json` | D6 街上每一块装饰的位置，游戏和测试都读它 | Modern Exteriors 和 Modern Interiors，跟 `town-decor.png` 一起算出来 | `scripts/art/decor.py` |
| `shops-decor.png` | D6 三间新店里的节日装饰 | Modern Interiors：`15_Christmas`、`11_Halloween`；手画的灯笼、蝙蝠、海报、小画和木牌 | `scripts/art/decor.py` |
| `town-story.png` | D4 街坊的故事留在街上的十五样东西，等着讲故事的人头上的小气泡 | 手画：车铃、工具箱、打气筒、车牌、旧自行车、坐垫、小米、月季、鸟窝、小板凳、书、告示、仙人掌、小书架、学士帽 | `scripts/art/story.py` |
| `town-story.json` | D4 每样东西摆在哪，三个街坊站在哪，游戏和测试都读它 | 手画，跟 `town-story.png` 一起算出来 | `scripts/art/story.py` |

## 给 LimeZu 的问题

Q-D3。要用 Lewis 的账户发，在 itch.io 的私信或者 LimeZu 留的邮箱都行。回信存进 `docs/art.md`。

> Hello LimeZu,
>
> I make Lamplight Nook, a small Windows app, sold on the Microsoft Store and as a direct download, in which pixel-art shop staff act out the work an AI assistant is doing. I bought Modern Interiors, Modern Exteriors and Modern Farm.
>
> Our build scripts compose your tiles into whole pictures (a café, a street, a few shop interiors), sometimes recolour them, and make the staff with your character generator. The app ships only those finished pictures, packed inside its archive. Your tiles and sheets are never shipped as separate files. You are credited in the app's settings with a link to your itch.io page.
>
> Two questions:
>
> 1. Does shipping these composed and modified pictures inside a commercial app count as redistribution under your licence?
> 2. Is the credit in the settings enough, or would you like it somewhere else as well, such as the store page?
>
> Thank you for the packs.
