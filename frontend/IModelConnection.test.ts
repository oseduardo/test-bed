/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { assert, expect } from "chai";
import { Id64, OpenMode, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { XYAndZ, Range3d, Transform } from "@bentley/geometry-core";
import { BisCodeSpec, CodeSpec, NavigationValue, RelatedElement, IModelVersion } from "@bentley/imodeljs-common";
import { TestData } from "./TestData";
import {
  DrawingViewState, OrthographicViewState, ViewState, IModelConnection,
  ModelSelectorState, DisplayStyle3dState, DisplayStyle2dState, CategorySelectorState,
} from "@bentley/imodeljs-frontend";
import { TestbedConfig } from "../common/TestbedConfig";
import { CONSTANTS } from "../common/Testbed";
import { MockRender } from "./MockRender";

describe("IModelConnection (#integration)", () => {
  let iModel: IModelConnection;

  before(async () => {
    MockRender.App.startup();

    Logger.initializeToConsole();
    Logger.setLevel("imodeljs-frontend.IModelConnection", LogLevel.Error); // Change to trace to debug

    await TestData.load();
    iModel = await IModelConnection.open(TestData.accessToken, TestData.testProjectId, TestData.testIModelId);
  });

  after(async () => {
    if (iModel)
      await iModel.close(TestData.accessToken);
    MockRender.App.shutdown();
  });

  it("should be able to get elements and models from an IModelConnection", async () => {
    assert.exists(iModel);
    assert.isTrue(iModel instanceof IModelConnection);
    assert.exists(iModel.models);
    assert.isTrue(iModel.models instanceof IModelConnection.Models);
    assert.exists(iModel.elements);
    assert.isTrue(iModel.elements instanceof IModelConnection.Elements);

    const elementProps = await iModel.elements.getProps(iModel.elements.rootSubjectId);
    assert.equal(elementProps.length, 1);
    assert.equal(iModel.elements.rootSubjectId, Id64.fromJSON(elementProps[0].id));
    assert.equal(iModel.models.repositoryModelId, RelatedElement.idFromJson(elementProps[0].model).toString());

    const queryElementIds = await iModel.elements.queryIds({ from: "BisCore.Category", limit: 20, offset: 0 });
    assert.isAtLeast(queryElementIds.size, 1);

    const formatObjs: any[] = await iModel.elements.formatElements(queryElementIds);
    assert.isAtLeast(formatObjs.length, 1);

    const modelProps = await iModel.models.getProps(iModel.models.repositoryModelId);
    assert.exists(modelProps);
    assert.equal(modelProps.length, 1);
    assert.equal(modelProps[0].id, iModel.models.repositoryModelId);
    assert.equal(iModel.models.repositoryModelId, modelProps[0].id);

    const rows: any[] = await iModel.executeQuery("SELECT CodeValue AS code FROM BisCore.Category LIMIT 20");
    assert.isAtLeast(rows.length, 1);
    assert.exists(rows[0].code);
    assert.equal(rows.length, queryElementIds.size);

    const codeSpecByName: CodeSpec = await iModel.codeSpecs.getByName(BisCodeSpec.spatialCategory);
    assert.exists(codeSpecByName);
    const codeSpecById: CodeSpec = await iModel.codeSpecs.getById(codeSpecByName.id);
    assert.exists(codeSpecById);
    const codeSpecByNewId: CodeSpec = await iModel.codeSpecs.getById(Id64.fromJSON(codeSpecByName.id));
    assert.exists(codeSpecByNewId);

    let viewDefinitions = await iModel.views.getViewList({ from: "BisCore.OrthographicViewDefinition" });
    assert.isAtLeast(viewDefinitions.length, 1);
    let viewState: ViewState = await iModel.views.load(viewDefinitions[0].id);
    assert.exists(viewState);
    assert.equal(viewState.classFullName, OrthographicViewState.getClassFullName());
    assert.equal(viewState.categorySelector.classFullName, CategorySelectorState.getClassFullName());
    assert.equal(viewState.displayStyle.classFullName, DisplayStyle3dState.getClassFullName());
    assert.instanceOf(viewState, OrthographicViewState);
    assert.instanceOf(viewState.categorySelector, CategorySelectorState);
    assert.instanceOf(viewState.displayStyle, DisplayStyle3dState);
    assert.instanceOf((viewState as OrthographicViewState).modelSelector, ModelSelectorState);

    viewDefinitions = await iModel.views.getViewList({ from: "BisCore.DrawingViewDefinition" });
    assert.isAtLeast(viewDefinitions.length, 1);
    viewState = await iModel.views.load(viewDefinitions[0].id);
    assert.exists(viewState);
    assert.equal(viewState.code.getValue(), viewDefinitions[0].name);
    assert.equal(viewState.classFullName, viewDefinitions[0].class);
    assert.equal(viewState.categorySelector.classFullName, CategorySelectorState.getClassFullName());
    assert.equal(viewState.displayStyle.classFullName, DisplayStyle2dState.getClassFullName());
    assert.instanceOf(viewState, DrawingViewState);
    assert.instanceOf(viewState.categorySelector, CategorySelectorState);
    assert.instanceOf(viewState.displayStyle, DisplayStyle2dState);
    assert.exists(iModel.projectExtents);

  });

  it("should be able to re-establish IModelConnection if the backend is shut down", async () => {
    let elementProps = await iModel.elements.getProps(iModel.elements.rootSubjectId);
    assert.equal(elementProps.length, 1);
    assert.equal(iModel.elements.rootSubjectId, Id64.fromJSON(elementProps[0].id));
    assert.equal(iModel.models.repositoryModelId, RelatedElement.idFromJson(elementProps[0].model).toString());

    let queryElementIds = await iModel.elements.queryIds({ from: "BisCore.Category", limit: 20, offset: 0 });
    assert.isAtLeast(queryElementIds.size, 1);

    // Restart Backend!!!
    assert(TestbedConfig.sendToMainSync({ name: CONSTANTS.RESTART_BACKEND, value: undefined }));

    elementProps = await iModel.elements.getProps(iModel.elements.rootSubjectId);
    assert.equal(elementProps.length, 1);
    assert.equal(iModel.elements.rootSubjectId, Id64.fromJSON(elementProps[0].id));
    assert.equal(iModel.models.repositoryModelId, RelatedElement.idFromJson(elementProps[0].model).toString());

    queryElementIds = await iModel.elements.queryIds({ from: "BisCore.Category", limit: 20, offset: 0 });
    assert.isAtLeast(queryElementIds.size, 1);
  });

  it("should be able to open an IModel with no versions", async () => {
    const projectId = await TestData.getTestProjectId(TestData.accessToken, "iModelJsIntegrationTest");
    const iModelId = await TestData.getTestIModelId(TestData.accessToken, projectId, "NoVersionsTest");
    const noVersionsIModel = await IModelConnection.open(TestData.accessToken, projectId, iModelId, OpenMode.Readonly, IModelVersion.latest());
    assert.isNotNull(noVersionsIModel);

    const noVersionsIModel2 = await IModelConnection.open(TestData.accessToken, projectId, iModelId, OpenMode.Readonly, IModelVersion.first());
    assert.isNotNull(noVersionsIModel2);

    const noVersionsIModel3 = await IModelConnection.open(TestData.accessToken, projectId, iModelId, OpenMode.Readonly, IModelVersion.asOfChangeSet(""));
    assert.isNotNull(noVersionsIModel3);
  });

  it("should be able to open the same IModel many times", async () => {
    const projectId = await TestData.getTestProjectId(TestData.accessToken, "iModelJsIntegrationTest");
    const iModelId = await TestData.getTestIModelId(TestData.accessToken, projectId, "ReadOnlyTest");

    const readOnlyTest = await IModelConnection.open(TestData.accessToken, projectId, iModelId, OpenMode.Readonly, IModelVersion.latest());
    assert.isNotNull(readOnlyTest);

    const promises = new Array<Promise<void>>();
    let n = 0;
    while (++n < 25) {
      const promise = IModelConnection.open(TestData.accessToken, projectId, iModelId, OpenMode.Readonly, IModelVersion.latest())
        .then((readOnlyTest2: IModelConnection) => {
          assert.isNotNull(readOnlyTest2);
          assert.isTrue(readOnlyTest.iModelToken.key === readOnlyTest2.iModelToken.key);
        });
      promises.push(promise);
    }

    await Promise.all(promises);
  });

  it("should reuse open briefcases for exclusive access", async () => {
    // Repeatedly opening a Readonly or ReadWrite connection should result in the same briefcase
    // Note that the IModelDb is opened with OpenParams.FixedVersion(AccessMode.Shared) in the case of ReadOnly connections, and
    // OpenParams.PullAndPush(AccessMode.Exclusive) in the case of ReadWrite connections.
    const openModes: OpenMode[] = [OpenMode.Readonly, OpenMode.ReadWrite];
    for (const openMode of openModes) {
      const iModel1 = await IModelConnection.open(TestData.accessToken, TestData.testProjectId, TestData.testIModelId, openMode, IModelVersion.latest());
      assert.isNotNull(iModel1);
      let n = 0;
      while (++n < 5) {
        const iModel2 = await IModelConnection.open(TestData.accessToken, TestData.testProjectId, TestData.testIModelId, openMode, IModelVersion.latest());
        assert.isNotNull(iModel2);
        assert.equal(iModel2.iModelToken.key, iModel1.iModelToken.key);
      }
      await iModel1.close(TestData.accessToken);
    }
  });

  it("should be able to request tiles from an IModelConnection", async () => {
    const modelProps = await iModel.models.queryProps({ from: "BisCore.PhysicalModel" });
    expect(modelProps.length).to.equal(1);

    const treeId = modelProps[0].id!.toString();
    const tree = await iModel.tiles.getTileTreeProps(treeId);

    expect(tree.id).to.equal(modelProps[0].id);
    expect(tree.maxTilesToSkip).to.equal(1);
    expect(tree.rootTile).not.to.be.undefined;

    const tf = Transform.fromJSON(tree.location);
    expect(tf.matrix.isIdentity).to.be.true;
    expect(tf.origin.isAlmostEqualXYZ(5.138785, 4.7847327, 10.15635152, 0.001)).to.be.true;

    const rootTile = tree.rootTile;
    expect(rootTile.contentId).to.equal("0/0/0/0/1");

    const range = Range3d.fromJSON(rootTile.range);
    const expectedRange = { x: 35.285026, y: 35.118263, z: 10.157 };
    expect(range.low.isAlmostEqualXYZ(-expectedRange.x, -expectedRange.y, -expectedRange.z, 0.001)).to.be.true;
    expect(range.high.isAlmostEqualXYZ(expectedRange.x, expectedRange.y, expectedRange.z, 0.001)).to.be.true;

    // The following are not known until we load the tile content.
    expect(rootTile.contentRange).to.be.undefined;
    expect(rootTile.isLeaf).to.be.false;
  });

  it("ECSQL with BLOB", async () => {
    assert.exists(iModel);
    let rows = await iModel.executeQuery("SELECT ECInstanceId,GeometryStream FROM bis.GeometricElement3d WHERE GeometryStream IS NOT NULL LIMIT 1");
    assert.equal(rows.length, 1);
    const row: any = rows[0];

    assert.isTrue(Id64.isValidId64(row.id));

    assert.isDefined(row.geometryStream);
    const geomStream: Uint8Array = row.geometryStream;
    assert.isAtLeast(geomStream.byteLength, 1);

    rows = await iModel.executeQuery("SELECT 1 FROM bis.GeometricElement3d WHERE GeometryStream=?", [geomStream]);
    assert.equal(rows.length, 1);
  });

  it("Parameterized ECSQL", async () => {
    assert.exists(iModel);
    let rows = await iModel.executeQuery("SELECT ECInstanceId,Model,LastMod,CodeValue,FederationGuid,Origin FROM bis.GeometricElement3d LIMIT 1");
    assert.equal(rows.length, 1);
    let expectedRow = rows[0];
    const expectedId = Id64.fromJSON(expectedRow.id);
    assert.isTrue(Id64.isValid(expectedId));
    const expectedModel: NavigationValue = expectedRow.model;
    assert.isTrue(Id64.isValidId64(expectedModel.id));
    const expectedLastMod: string = expectedRow.lastMod;
    const expectedFedGuid: string | undefined = !!expectedRow.federationGuid ? expectedRow.federationGuid : undefined;
    const expectedOrigin: XYAndZ = expectedRow.origin;

    let actualRows = await iModel.executeQuery("SELECT 1 FROM bis.GeometricElement3d WHERE ECInstanceId=? AND Model=? OR (LastMod=? AND CodeValue=? AND FederationGuid=? AND Origin=?)",
      [expectedId, expectedModel, expectedLastMod, expectedRow.codeValue, expectedFedGuid, expectedOrigin]);
    assert.equal(actualRows.length, 1);

    actualRows = await iModel.executeQuery("SELECT 1 FROM bis.GeometricElement3d WHERE ECInstanceId=:id AND Model=:model OR (LastMod=:lastmod AND CodeValue=:codevalue AND FederationGuid=:fedguid AND Origin=:origin)",
      {
        id: expectedId, model: expectedModel, lastmod: expectedLastMod,
        codevalue: expectedRow.codeValue, fedguid: expectedFedGuid, origin: expectedOrigin,
      });
    assert.equal(actualRows.length, 1);

    // single parameter query
    actualRows = await iModel.executeQuery("SELECT 1 FROM bis.Element WHERE LastMod=?", [expectedLastMod]);
    assert.isTrue(actualRows.length >= 1);

    actualRows = await iModel.executeQuery("SELECT 1 FROM bis.Element WHERE LastMod=:lastmod", { lastmod: expectedLastMod });
    assert.isTrue(actualRows.length >= 1);

    // New query with point2d parameter
    rows = await iModel.executeQuery("SELECT ECInstanceId,Origin FROM bis.GeometricElement2d LIMIT 1");
    assert.equal(rows.length, 1);

    expectedRow = rows[0];
    actualRows = await iModel.executeQuery("SELECT 1 FROM bis.GeometricElement2d WHERE ECInstanceId=? AND Origin=?",
      [Id64.fromJSON(expectedRow.id), expectedRow.origin]);
    assert.equal(actualRows.length, 1);

    actualRows = await iModel.executeQuery("SELECT 1 FROM bis.GeometricElement2d WHERE ECInstanceId=:id AND Origin=:origin",
      { id: expectedRow.id, origin: expectedRow.origin });
    assert.equal(actualRows.length, 1);
  }).timeout(99999);

  it("should generate unique transient IDs", () => {
    for (let i = 1; i < 40; i++) {
      const id = iModel.transientIds.next;
      expect(Id64.getLocalId(id)).to.equal(i); // auto-incrementing local ID beginning at 1
      expect(Id64.getBriefcaseId(id)).to.equal(0xffffff); // illegal briefcase ID
      expect(Id64.isTransient(id)).to.be.true;
      expect(Id64.isTransient(id.toString())).to.be.true;
    }

    expect(Id64.isTransient(Id64.invalid)).to.be.false;
    expect(Id64.isTransient("0xffffff6789abcdef")).to.be.true;
  });
});
