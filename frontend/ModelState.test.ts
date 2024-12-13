/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { expect, assert } from "chai";
import * as path from "path";
import { ModelSelectorState, IModelConnection, DrawingModelState, SheetModelState, SpatialModelState, GeometricModelState } from "@bentley/imodeljs-frontend";
import { Id64 } from "@bentley/bentleyjs-core";
import { Code, ModelSelectorProps } from "@bentley/imodeljs-common";
import { CONSTANTS } from "../common/Testbed";
import { MockRender } from "./MockRender";

const iModelLocation = path.join(CONSTANTS.IMODELJS_CORE_DIRNAME, "core/backend/lib/test/assets/");

describe("ModelState", () => {
  let imodel: IModelConnection;
  let imodel2: IModelConnection;
  before(async () => {
    MockRender.App.startup();
    imodel2 = await IModelConnection.openStandalone(iModelLocation + "mirukuru.ibim");
    imodel = await IModelConnection.openStandalone(iModelLocation + "CompatibilityTestSeed.bim");
  });

  after(async () => {
    if (imodel) await imodel.closeStandalone();
    if (imodel2) await imodel2.closeStandalone();
    MockRender.App.shutdown();
  });

  it("ModelSelectors should hold models", () => {
    const props: ModelSelectorProps = {
      classFullName: ModelSelectorState.getClassFullName(),
      model: Id64.fromLocalAndBriefcaseIds(1, 1),
      code: Code.createEmpty(),
      models: ["0x1"],
    };

    const selector = new ModelSelectorState(props, imodel);
    selector.addModels([Id64.fromLocalAndBriefcaseIds(2, 1), Id64.fromLocalAndBriefcaseIds(2, 1), Id64.fromLocalAndBriefcaseIds(2, 3)]);
    assert.equal(selector.models.size, 3);
    const out = selector.toJSON();
    assert.isArray(out.models);
    assert.equal(out.models.length, 3);
    out.iModel = imodel;
    const sel3 = selector.clone();
    assert.deepEqual(sel3, selector, "clone worked");
  });

  it("should be able to load ModelState", async () => {
    await imodel.models.load(["0x24", "0x28", "0x2c", "0x11", "0x34", "0x24", "nonsense"]);
    const models = imodel.models.loaded;
    assert.equal(models.size, 5);
    assert.instanceOf(models.get("0x24"), DrawingModelState);
    assert.instanceOf(models.get("0x28"), SheetModelState);
    assert.instanceOf(models.get("0x2c"), DrawingModelState);
    assert.instanceOf(models.get("0x11"), SpatialModelState);
    assert.instanceOf(models.get("0x34"), DrawingModelState);

    models.forEach((model) => {
      const geomModel = model as GeometricModelState;
      expect(geomModel.is3d).to.equal(model instanceof SpatialModelState);
      expect(geomModel.is2d).to.equal(!geomModel.is3d);
    });

    models.forEach((model) => assert.deepEqual(model.clone(), model, "clone of ModelState should work"));

    await imodel.models.load(["0x24", "0x28", "0x2c", "0x11", "0x34", "0x24", "nonsense"]);
    assert.equal(models.size, 5);

    const modelProps = await imodel.models.queryProps({ from: SpatialModelState.sqlName });
    assert.isAtLeast(modelProps.length, 2);

    await imodel2.models.load(["0x28", "0x1c"]);
    assert.equal(imodel2.models.loaded.size, 2);
    const scalableMesh = imodel2.models.getLoaded("0x28");
    assert.instanceOf(scalableMesh, SpatialModelState, "ScalableMeshModel should be SpatialModel");
    assert.equal(scalableMesh!.classFullName, "ScalableMesh:ScalableMeshModel");
  });

  it("view thumbnails", async () => {
    const thumbnail = await imodel2.views.getThumbnail("0x24");
    assert.equal(thumbnail.format, "jpeg");
    assert.equal(thumbnail.height, 768);
    assert.equal(thumbnail.width, 768);
    assert.equal(thumbnail.image.length, 18062);
    assert.equal(thumbnail.image[3], 224);
    assert.equal(thumbnail.image[18061], 217);

    try {
      await imodel2.views.getThumbnail("0x25");
      assert.fail("getThumbnail should not return");
    } catch (_err) { } // thumbnail doesn't exist

    thumbnail.format = "png";
    thumbnail.height = 100;
    thumbnail.width = 200;
    thumbnail.image = new Uint8Array(300);
    thumbnail.image.fill(33);

    // await imodel2.views.saveThumbnail("0x24", thumbnail);
    // const thumbnail2 = await imodel2.views.getThumbnail("0x24");
    // assert.equal(thumbnail2.format, "png");
    // assert.equal(thumbnail2.height, 100);
    // assert.equal(thumbnail2.width, 200);
    // assert.equal(thumbnail2.image.length, 300);
    // assert.equal(thumbnail2.image[3], 33);
  });
});
