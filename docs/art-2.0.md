# 2.0 的美术清单

`docs/plan-2.0.md` 各包要加的图记在这里，写法照 `docs/art-1.9.md`：每张图从哪个素材包拼出来，还是手画，由哪个脚本做。素材包和授权见 `docs/art.md`。

`tests/art-sources.test.ts` 把这份清单和 1.4 到 1.9 的五份一起读。

## 清单

| 产出 | 用在 | 出处 | 脚本 |
|---|---|---|---|
| `river-street.png` | J1 河边街的地面：天、对岸的树、桥下的河道和石栏杆、草地、人行道、第一条街的路过了桥到头，前面是河 | Modern Exteriors：`2_City_Terrains`、`1_Terrains_and_Fences`、`5_Floor_Modular_Buildings` 的屋顶。天、水、栏杆是手画 | `scripts/art/river.py` |
| `river-fronts.png` | J1 花店和书店的门面。花店是红砖楼，两扇窗上有条纹遮阳篷。书店是灰石楼，一扇拱形大窗 | Modern Exteriors：`5_Floor_Modular_Buildings` | `scripts/art/river.py` |
| `river-props.png` | J1 河边街的路灯、长椅、树、花盆，花店门口三桶花 | Modern Exteriors：`3_City_Props`、`17_Garden` | `scripts/art/river.py` |
| `river-tower.png` | J1 河边停了的老钟楼：灰石塔身，钟面没有指针还裂了一道。木头钟架上的屋顶塌了一半，门用木条钉着，一边爬着藤。素材包里没有塔身（Q-J7） | 手画 | `scripts/art/river.py` |
| `river.json` | J1 桥、两间店的门面和门、钟楼、每样摆设站在哪，`app/renderer/game/town.ts` 读，接在第一条街后面 | 手画（脚本算出来的位置） | `scripts/art/river.py` |
| `flowershop.png` | J2 花店内景：芳姐的店。三层木台上摆着小花瓶，工作台上包着两束花。柜台上有一卷包花纸和一罐花枝，墙角三桶花，墙上挂一个花环 | Modern Interiors：`Room_Builder` 的地和墙。Modern Exteriors：`17_Garden` 的花瓶、花盆和花桶。木台、工作台、柜台、花环、墙上的搁板是手画 | `scripts/art/flowershop.py` |
| `flowershop-room.png` | J2 花店，家具后面那层 | Modern Interiors 和 Modern Exteriors，同 `flowershop.png` | `scripts/art/pieces.py` |
| `flowershop-pieces.png` | J2 花店，家具前面那层 | Modern Interiors 和 Modern Exteriors，同 `flowershop.png` | `scripts/art/pieces.py` |
| `bookshop.png` | J2 书店内景：简伯的店。一个高书架，长桌上几摞书和一本摊开的，柜台上堆着等标价的书，墙角一个地球仪和一个矮书架 | Modern Interiors：`Room_Builder` 的地和墙，`5_Classroom_and_library` 的书架和地球仪。桌子、柜台、一摞摞的书是手画 | `scripts/art/bookshop.py` |
| `bookshop-room.png` | J2 书店，家具后面那层 | Modern Interiors，同 `bookshop.png` | `scripts/art/pieces.py` |
| `bookshop-pieces.png` | J2 书店，家具前面那层 | Modern Interiors，同 `bookshop.png` | `scripts/art/pieces.py` |
| `fangjie.png` | J2 芳姐当店主时的行走图，和客人芳姐同一套搭配 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `jianbo.png` | J2 书店店主简伯的行走图：年纪大些，棕色外套，戴眼镜 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `bookseller.png` | J3 简伯出门讲故事时的行走图，跟店主简伯同一套搭配 | Modern Interiors：`Character_Generator` | `scripts/art/characters.py` |
| `tale-cutting.png` | J3 芳姐第一章：小瓶里插着桂姨给的一枝月季，挂在店里墙上 | 手画 | `scripts/art/tales.py` |
| `tale-stallsign.png` | J3 芳姐第二章：摆摊时的小木牌，挂在店里墙上 | 手画 | `scripts/art/tales.py` |
| `tale-pressed.png` | J3 芳姐第三章：相框里陈婆婆送的压花，挂在店里墙上 | 手画 | `scripts/art/tales.py` |
| `tale-seeds.png` | J3 芳姐第四章：老家带来的一包种子，挂在店里墙上 | 手画 | `scripts/art/tales.py` |
| `tale-snapshot.png` | J3 芳姐第五章：开张那天的照片，挂在店里墙上 | 手画 | `scripts/art/tales.py` |
| `tale-dictionary.png` | J3 简伯第一章：架子上包着牛皮纸的字典，挂在店里墙上 | 手画 | `scripts/art/tales.py` |
| `tale-stub.png` | J3 简伯第二章：四十年前去海边的车票，挂在店里墙上 | 手画 | `scripts/art/tales.py` |
| `tale-libcard.png` | J3 简伯第三章：镇图书馆的借书证，挂在店里墙上 | 手画 | `scripts/art/tales.py` |
| `tale-map.png` | J3 简伯第四章：河边还是码头时的镇地图，挂在店里墙上 | 手画 | `scripts/art/tales.py` |
| `tale-buysign.png` | J3 简伯第五章：“收旧书”的木牌，挂在店里墙上 | 手画 | `scripts/art/tales.py` |
