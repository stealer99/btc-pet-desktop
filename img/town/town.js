// tools/build_assets.py 가 생성 — 직접 수정하지 말 것
window.BTCPET_TOWN = {
  "home": {
    "name": "home",
    "image": "home.png",
    "nightImage": "home_night.png",
    "source": "buildings.png",
    "cell": [
      0,
      0
    ],
    "width": 428,
    "height": 342,
    "heightUnits": 2.0,
    "anchor": "bottom-center",
    "screen": null,
    "screenFrameColor": null,
    "screenFramePx": null,
    "sign": null,
    "label": "🏠 집",
    "signText": null,
    "board": null
  },
  "office": {
    "name": "office",
    "image": "office.png",
    "nightImage": "office_night.png",
    "source": "buildings.png",
    "cell": [
      1,
      0
    ],
    "width": 465,
    "height": 389,
    "heightUnits": 3.0,
    "anchor": "bottom-center",
    "screen": null,
    "screenFrameColor": null,
    "screenFramePx": null,
    "sign": {
      "x": 130,
      "y": 176,
      "w": 204,
      "h": 42
    },
    "label": "🏢 회사",
    "signText": "{company}",
    "board": null
  },
  "upbit": {
    "name": "upbit",
    "image": "upbit.png",
    "nightImage": "upbit_night.png",
    "source": "exchange_towers.png",
    "cell": [
      0,
      0
    ],
    "width": 405,
    "height": 949,
    "heightUnits": 4.0,
    "anchor": "bottom-center",
    "screen": {
      "x": 43,
      "y": 26,
      "w": 316,
      "h": 85
    },
    "screenFrameColor": [
      14,
      139,
      229
    ],
    "screenFramePx": 24,
    "sign": {
      "x": 98,
      "y": 718,
      "w": 207,
      "h": 44
    },
    "label": "🟦 업비트 타워",
    "signText": "UPBIT",
    "board": "usdt"
  },
  "bitget": {
    "name": "bitget",
    "image": "bitget.png",
    "nightImage": "bitget_night.png",
    "source": "exchange_towers.png",
    "cell": [
      1,
      0
    ],
    "width": 405,
    "height": 949,
    "heightUnits": 4.0,
    "anchor": "bottom-center",
    "screen": {
      "x": 44,
      "y": 26,
      "w": 316,
      "h": 84
    },
    "screenFrameColor": [
      5,
      205,
      212
    ],
    "screenFramePx": 24,
    "sign": {
      "x": 98,
      "y": 718,
      "w": 207,
      "h": 44
    },
    "label": "🟩 거래소 타워",
    "signText": "{exchange}",
    "board": "btc"
  }
};
window.BTCPET_TOWN_ORDER = ["home", "office", "upbit", "bitget"];
