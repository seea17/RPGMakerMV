//=============================================================================
// ParallelPreload.js
// ----------------------------------------------------------------------------
// Copyright (c) 2015 Triacontane
// This software is released under the MIT License.
// http://opensource.org/licenses/mit-license.php
// ----------------------------------------------------------------------------
// Version
// 1.0.0 2016/04/23 初版
// ----------------------------------------------------------------------------
// [Blog]   : http://triacontane.blogspot.jp/
// [Twitter]: https://twitter.com/triacontane/
// [GitHub] : https://github.com/triacontane/
//=============================================================================

/*:
 * @plugindesc 並列プリロードプラグイン
 * @author トリアコンタン
 *
 * @param 素材一覧データ
 * @desc 「/data」以下に配置するJSONファイル名
 * @default MV_Project
 *
 * @param ロード間隔
 * @desc ファイルをロードする間隔(フレーム単位)です。
 * 0に指定すると、全てロードしてからゲーム開始します。
 * @default 0
 *
 * @help ゲーム開始時に画像素材を並列ロードします。
 * 可能な限り負荷を分散、軽減するように設計されています。
 *
 * ロードする素材の一覧はfftfantt氏制作の「素材一覧用JSON作成プログラム」を
 * 使用してください。
 * 同プログラムから必要な素材の一覧が作成されたJSONファイル
 * 「MV_Project.json」を作成して「/data」以下に配置します。
 * 作成する際は、「拡張子をつける」およびオーディオ関連のチェックボックスを
 * 外してください。
 *
 * ・使い方
 * https://github.com/fftfantt/RPGMakerMV/wiki/JSON_Maker_for_MV
 *
 * ・本体
 * https://raw.githubusercontent.com/fftfantt/RPGMakerMV/master/JSON_Maker_for_MV.zip
 *
 * ブラウザから実行する場合、画像のロードが完了してから次のロードを開始します。
 * そのため、大量の画像を指定するとロード完了までに時間が掛かり
 * 効果が薄くなります。
 *
 * また、スマートフォン等メモリに限りがあるデバイスで実行する場合、
 * 大量の画像のプリロードは動作不良の原因となります。
 *
 * 注意！
 * 本プラグインは画像のロードしか行いません。
 * 音声ファイルについては対象外となっています。
 *
 * 利用規約：
 *  作者に無断で改変、再配布が可能で、利用形態（商用、18禁利用等）
 *  についても制限はありません。
 *  このプラグインはもうあなたのものです。
 */

var $dataMaterials = null;

(function () {
    'use strict';
    var pluginName = 'ParallelPreload';

    var getParamString = function(paramNames) {
        var value = getParamOther(paramNames);
        return value === null ? '' : value;
    };

    var getParamNumber = function(paramNames, min, max) {
        var value = getParamOther(paramNames);
        if (arguments.length < 2) min = -Infinity;
        if (arguments.length < 3) max = Infinity;
        return (parseInt(value, 10) || 0).clamp(min, max);
    };

    var getParamOther = function(paramNames) {
        if (!Array.isArray(paramNames)) paramNames = [paramNames];
        for (var i = 0; i < paramNames.length; i++) {
            var name = PluginManager.parameters(pluginName)[paramNames[i]];
            if (name) return name;
        }
        return null;
    };

    if (!Object.prototype.hasOwnProperty('iterate')) {
        Object.defineProperty(Object.prototype, 'iterate', {
            value : function (handler) {
                Object.keys(this).forEach(function (key, index) {
                    handler.call(this, key, this[key], index);
                }, this);
            }
        });
    }

    //=============================================================================
    // パラメータの取得と整形
    //=============================================================================
    var paramMaterialListData = getParamString(['MaterialListData', '素材一覧データ']);
    var paramLoadInterval     = getParamNumber(['LoadInterval', 'ロード間隔']);

    var localLoadComplete     = false;
    var localIntervalCount    = 0;

    //=============================================================================
    // DataManager
    //  ロード対象素材スタックの作成を追加定義します。
    //=============================================================================
    DataManager._databaseFiles.push(
        {name: '$dataMaterials', src: paramMaterialListData + '.json'}
    );
    DataManager.materialFilePaths = [];

    var _DataManager_onLoad = DataManager.onLoad;
    DataManager.onLoad = function(object) {
        _DataManager_onLoad.apply(this, arguments);
        if (object === $dataMaterials) {
            this.initParallelPreload();
        }
    };

    DataManager.initParallelPreload = function() {
        $dataMaterials.iterate(function (key, value) {
            for (var i = 0, n = value.length; i < n; i++) {
                this.materialFilePaths.push([key, value[i]]);
            }
        }.bind(this));
    };

    //=============================================================================
    // Scene_Base
    //  ロード処理を実行します。
    //=============================================================================
    var _Scene_Base_update = Scene_Base.prototype.update;
    Scene_Base.prototype.update = function() {
        _Scene_Base_update.apply(this, arguments);
        if (!localLoadComplete) this.updateParallelPreload();
    };

    Scene_Base.prototype.updateParallelPreload = function() {
        while (localIntervalCount <= 0 && !localLoadComplete) {
            ImageManager.loadMaterial();
        }
        localIntervalCount--;
    };

    //=============================================================================
    // ImageManager
    //  ロード処理を実行します。
    //=============================================================================
    ImageManager.loadHandlers = {
        animations   : 'loadAnimation',
        battlebacks1 : 'loadBattleback1',
        battlebacks2 : 'loadBattleback2',
        enemies      : 'loadEnemy',
        characters   : 'loadCharacter',
        faces        : 'loadFace',
        parallaxes   : 'loadParallax',
        pictures     : 'loadPicture',
        sv_actors    : 'loadSvActor',
        sv_enemies   : 'loadSvEnemy',
        system       : 'loadSystem',
        tilesets     : 'loadTileset',
        titles1      : 'loadTitle1',
        titles2      : 'loadTitle2'
    };

    ImageManager.loadMaterial = function() {
        var filePathInfo = DataManager.materialFilePaths.shift();
        if (filePathInfo) {
            var loadHandler = this.loadHandlers[filePathInfo[0]];
            if (!loadHandler) return;
            if (Utils.isOptionValid('test')) {
                console.log('Loaded:' + filePathInfo[0] + '/' + filePathInfo[1]);
            }
            var bitmap = this[loadHandler](filePathInfo[1], 0);
            if (bitmap.isReady()) return;
            if (Utils.isNwjs()) {
                localIntervalCount = paramLoadInterval;
            } else {
                localIntervalCount = Infinity;
                bitmap.addLoadListener(function () {
                    localIntervalCount = paramLoadInterval;
                }.bind(this));
            }
        } else {
            localLoadComplete = true;
        }
    };

    //=============================================================================
    // Bitmap
    //  ロードと描画のタイミングを分離します。
    //=============================================================================
    Bitmap.prototype._onLoad = function() {
        this._isLoading = false;
        this._isDraw = false;
        this.resize(this._image.width, this._image.height);
        this._callLoadListeners();
    };

    Bitmap.prototype.drawImage = function() {
        this._context.drawImage(this._image, 0, 0);
        this._setDirty();
        this._isDraw = true;
    };

    Bitmap.prototype.drawImageIfNeed = function() {
        if (this._image && this.isReady() && !this._isDraw) {
            this.drawImage();
        }
    };

    var _Bitmap_blt = Bitmap.prototype.blt;
    Bitmap.prototype.blt = function(source, sx, sy, sw, sh, dx, dy, dw, dh) {
        source.drawImageIfNeed();
        _Bitmap_blt.apply(this, arguments);
    };

    //=============================================================================
    // Sprite
    //  Bitmapのロード完了時に描画処理を実行します。
    //=============================================================================
    var _Sprite__onBitmapLoad = Sprite.prototype._onBitmapLoad;
    Sprite.prototype._onBitmapLoad = function() {
        if (this._bitmap) this._bitmap.drawImageIfNeed();
        _Sprite__onBitmapLoad.apply(this, arguments);
    };

    //=============================================================================
    // TilingSprite
    //  Bitmapのロード完了時に描画処理を実行します。
    //=============================================================================
    var _TilingSprite__onBitmapLoad = TilingSprite.prototype._onBitmapLoad;
    TilingSprite.prototype._onBitmapLoad = function() {
        if (this._bitmap) this._bitmap.drawImageIfNeed();
        _TilingSprite__onBitmapLoad.apply(this, arguments);
    };
})();
