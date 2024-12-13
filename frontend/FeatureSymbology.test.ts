/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { assert, expect } from "chai";
// import { Point3d, Vector3d, YawPitchRollAngles, Range3d, Angle, Matrix3d } from "@bentley/geometry-core";
import { ViewDefinitionProps, GeometryClass, Feature, RgbColor, LinePixels, ViewFlags } from "@bentley/imodeljs-common";
import * as path from "path";
// import { DeepCompare } from "@bentley/geometry-core";
import { Id64 } from "@bentley/bentleyjs-core";
import { ViewState, SpatialViewState, IModelConnection, FeatureSymbology } from "@bentley/imodeljs-frontend";
import { CONSTANTS } from "../common/Testbed";

const iModelLocation = path.join(CONSTANTS.IMODELJS_CORE_DIRNAME, "core/backend/lib/test/assets/test.bim");

class Overrides extends FeatureSymbology.Overrides {
  public constructor(view?: ViewState) { super(view); }

  public get neverDrawn() { return this._neverDrawn; }
  public get alwaysDrawn() { return this._alwaysDrawn; }
  public get modelOverrides() { return this._modelOverrides; }
  public get elementOverrides() { return this._elementOverrides; }
  public get subCategoryOverrides() { return this._subCategoryOverrides; }
  public get visibleSubCategories() { return this._visibleSubCategories; }
}

describe("FeatureSymbology.Appearance", () => {
  it("default constructor works as expected", () => {
    const app = FeatureSymbology.Appearance.fromJSON();
    assert.isUndefined(app.rgb);
    assert.isUndefined(app.weight);
    assert.isUndefined(app.transparency);
    assert.isUndefined(app.linePixels);
    assert.isUndefined(app.ignoresMaterial);
  });

  it("AppearanceProps passed in constructor works as expected", () => {
    const props1 = { rgb: new RgbColor(100, 100, 100), weight: 1, transparency: 200 / 255, linePixels: LinePixels.Code2, ignoresMaterial: true } as FeatureSymbology.AppearanceProps;
    const props2 = { rgb: new RgbColor(100, 100, 100), weight: 1, transparency: 200 / 255, linePixels: LinePixels.Code2 } as FeatureSymbology.AppearanceProps;
    let app = FeatureSymbology.Appearance.fromJSON(props1);
    assert.isTrue(app.overridesRgb);
    assert.isTrue(app.overridesWeight);
    assert.isTrue(app.overridesTransparency);
    assert.isTrue(app.overridesLinePixels);
    assert.isTrue(app.ignoresMaterial);

    app = FeatureSymbology.Appearance.fromJSON(props2);
    assert.isUndefined(app.ignoresMaterial);
  });

  it("extend works as expected", () => {
    const props1 = { rgb: new RgbColor(100, 100, 100), linePixels: LinePixels.Code2, ignoresMaterial: true } as FeatureSymbology.AppearanceProps;
    const props2 = { rgb: new RgbColor(250, 180, 150), weight: 1, transparency: 200 / 255, linePixels: LinePixels.Code3 } as FeatureSymbology.AppearanceProps;
    const expectedProps = { rgb: new RgbColor(100, 100, 100), linePixels: LinePixels.Code2, ignoresMaterial: true, weight: 1, transparency: 200 / 255 } as FeatureSymbology.AppearanceProps;
    let app1 = FeatureSymbology.Appearance.fromJSON(props1);
    const app2 = FeatureSymbology.Appearance.fromJSON(props2);
    app1 = app2.extendAppearance(app1);
    const expected = FeatureSymbology.Appearance.fromJSON(expectedProps);
    assert.isTrue(expected.equals(app1));
  });
});

describe("FeatureSymbology.Overrides", () => {
  let imodel: IModelConnection,
    viewState: SpatialViewState,
    overrides: Overrides;

  before(async () => {
    imodel = await IModelConnection.openStandalone(iModelLocation);
    const viewRows: ViewDefinitionProps[] = await imodel.views.queryProps({ from: SpatialViewState.sqlName });
    assert.exists(viewRows, "Should find some views");
    viewState = await imodel.views.load(viewRows[0].id!) as SpatialViewState;
  });

  after(async () => {
    if (imodel)
      await imodel.closeStandalone();
  });

  it("default constructor works as expected", () => {
    overrides = new Overrides();
    assert.isFalse(overrides.isClassVisible(GeometryClass.Construction), "constructions");
    assert.isFalse(overrides.isClassVisible(GeometryClass.Dimension), "dimensions");
    assert.isFalse(overrides.isClassVisible(GeometryClass.Pattern), "patterns");
    assert.isTrue(overrides.lineWeights, "line weights");
    assert.isFalse(overrides.isAlwaysDrawnExclusive, "drawn exclusive");
    assert.exists(overrides.neverDrawn, "never");
    assert.exists(overrides.alwaysDrawn, "always");
    assert.exists(overrides.modelOverrides, "model overrides");
    assert.exists(overrides.elementOverrides, "element overrides");
    assert.exists(overrides.visibleSubCategories, "visible sub-categories");
    assert.exists(overrides.subCategoryOverrides, "sub-category overrides");
  });

  it("constructor with ViewState parameter works as expected", () => {
    // load viewState Special Elements
    const neverDrawn = new Set<string>();
    const alwaysDrawn = new Set<string>();
    neverDrawn.add("0x123");
    alwaysDrawn.add("0x124");
    viewState.setNeverDrawn(neverDrawn);
    viewState.setAlwaysDrawn(alwaysDrawn);

    // init overrides from ViewState
    overrides = new Overrides(viewState);

    expect(overrides.isClassVisible(GeometryClass.Construction)).to.equal(viewState.viewFlags.constructions);
    expect(overrides.isClassVisible(GeometryClass.Dimension)).to.equal(viewState.viewFlags.dimensions);
    expect(overrides.isClassVisible(GeometryClass.Pattern)).to.equal(viewState.viewFlags.patterns);
    expect(overrides.lineWeights).to.equal(viewState.viewFlags.weights);
    expect(overrides.neverDrawn.toId64Array()).to.deep.equals(Array.from(viewState.neverDrawn!));
    expect(overrides.alwaysDrawn.toId64Array()).to.deep.equals(Array.from(viewState.alwaysDrawn!));
  });

  it("isClassVisible works as expected", () => {
    const vf = new ViewFlags();
    vf.constructions = false;
    vf.dimensions = false;
    vf.patterns = false;
    viewState.displayStyle.viewFlags = vf;

    assert.isFalse(overrides.isClassVisible(GeometryClass.Construction), "constructions 1");
    assert.isFalse(overrides.isClassVisible(GeometryClass.Dimension), "dimensions 1");
    assert.isFalse(overrides.isClassVisible(GeometryClass.Pattern), "patterns 1");

    vf.constructions = true;
    viewState.displayStyle.viewFlags = vf;
    overrides = new Overrides(viewState);

    assert.isTrue(overrides.isClassVisible(GeometryClass.Construction), "constructions 2");

    vf.dimensions = true;
    viewState.displayStyle.viewFlags = vf;
    overrides = new Overrides(viewState);

    assert.isTrue(overrides.isClassVisible(GeometryClass.Dimension), "dimensions 2");

    vf.patterns = true;
    viewState.displayStyle.viewFlags = vf;
    overrides = new Overrides(viewState);

    assert.isTrue(overrides.isClassVisible(GeometryClass.Pattern), "patterns 2");

    assert.isTrue(overrides.isClassVisible(GeometryClass.Primary), "default");
  });

  it("isSubCategoryVisible works as expected", () => {
    overrides = new Overrides();
    const subCategoryId = Id64.fromString("0x124");
    assert.isFalse(overrides.isSubCategoryIdVisible(subCategoryId));

    overrides.setVisibleSubCategory(subCategoryId);
    assert.isTrue(overrides.isSubCategoryIdVisible(subCategoryId));
  });

  it("isFeatureVisible works as expected", () => {
    overrides = new Overrides();
    const elementId = Id64.fromString("0x123");
    const subCategoryId = Id64.fromString("0x124");
    const geometryClass = GeometryClass.Construction;
    const feature = new Feature(elementId, subCategoryId, geometryClass);

    overrides = new Overrides();
    assert.isFalse(overrides.isFeatureVisible(feature), "if subCategoryId isn't included in visibleSubCategories set, feature isn't visible");

    overrides.setNeverDrawn(elementId);
    assert.isFalse(overrides.isFeatureVisible(feature), "if elementId is in never drawn set, feature isn't visible");

    overrides = new Overrides();
    overrides.setAlwaysDrawn(elementId);

    assert.isTrue(overrides.isFeatureVisible(feature), "if elementId is in always drawn set, feature is visible");

    overrides = new Overrides();
    overrides.isAlwaysDrawnExclusive = true;

    // doesn't sound right... but this is how it works in the native code
    assert.isFalse(overrides.isFeatureVisible(feature), "if alwaysDrawnExclusive flag is set, but element not in always drawn set, feature isn't visible");

    overrides = new Overrides();
    overrides.setVisibleSubCategory(subCategoryId);
    assert.isFalse(overrides.isFeatureVisible(feature), "if geometryClass isn't visible, feature isn't visible");

    const vf = new ViewFlags();
    vf.constructions = true;
    viewState.displayStyle.viewFlags = vf;
    overrides = new Overrides(viewState);
    overrides.setVisibleSubCategory(subCategoryId);
    assert.isFalse(overrides.isFeatureVisible(feature), "if geometryClass and subCategory are visible, feature is visible");
  });

  it("getFeatureAppearance works as expected", () => {
    overrides = new Overrides();
    const id = Id64.fromString("0x111");
    const elementId = Id64.fromString("0x128");
    const subCategoryId = Id64.fromString("0x129");
    const geometryClass = GeometryClass.Construction;
    const feature = new Feature(elementId, subCategoryId, geometryClass);
    const props = { rgb: new RgbColor(100, 100, 100), weight: 1, transparency: 100 / 255, linePixels: LinePixels.Solid, ignoresMaterial: true } as FeatureSymbology.AppearanceProps;
    const modelProps = { ...props, transparency: 200 / 255 } as FeatureSymbology.AppearanceProps;
    const badModelProps = { ...props, transparency: 356 / 255 } as FeatureSymbology.AppearanceProps;
    const elemProps = { transparency: 200 / 255, linePixels: LinePixels.HiddenLine } as FeatureSymbology.AppearanceProps;
    const subCatProps = { linePixels: LinePixels.Code3, transparency: 90 / 255 } as FeatureSymbology.AppearanceProps;
    let modelApp = FeatureSymbology.Appearance.fromJSON(modelProps);
    const elemApp = FeatureSymbology.Appearance.fromJSON(elemProps);
    const subCatApp = FeatureSymbology.Appearance.fromJSON(subCatProps);
    let appearance: FeatureSymbology.Appearance | undefined;

    overrides.setNeverDrawn(elementId);

    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isUndefined(appearance, "returns undefined if feature id is in the never drawn set");

    overrides = new Overrides();
    overrides.isAlwaysDrawnExclusive = true;

    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isUndefined(appearance, "returns false if feature isn't in always drawn set, but alwaysDrawnExclusive flag is set");

    overrides = new Overrides();
    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isUndefined(appearance, "returns false if feature isn't in always drawn set nor subCategoryId in visibleSubCategories set");

    overrides = new Overrides();
    overrides.setAlwaysDrawn(elementId);
    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isDefined(appearance, "return true if elementId is in always drawn set");

    const vf = new ViewFlags();
    vf.constructions = true;
    viewState.displayStyle.viewFlags = vf;
    overrides = new Overrides(viewState);
    overrides.setVisibleSubCategory(subCategoryId);
    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isDefined(appearance, "return true if either elementId is in always drawn set or subCategoryId is visible as well as geometryClass is visible");

    overrides = new Overrides();
    appearance = FeatureSymbology.Appearance.fromJSON(props);
    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isUndefined(appearance, "if neither elementId is in alwaysDrawn set nor subCategoryId in visibleSubCategory set nor id in modelOverrides map, then app is reset");

    overrides = new Overrides();
    appearance = FeatureSymbology.Appearance.fromJSON(props);
    overrides.setAlwaysDrawn(elementId);
    appearance = overrides.getFeatureAppearance(feature, id);
    const msg = "if elementId in alwaysDrawn set, but id not in ModelOverrides map, nor elementId in elementOverrides map, nor subCategoryId in subCategoryOverrides, then app will be set to default overrides";
    assert.isTrue(appearance!.equals(overrides.defaultOverrides), msg);

    overrides = new Overrides();
    appearance = FeatureSymbology.Appearance.fromJSON(props);
    overrides.setAlwaysDrawn(elementId);
    overrides.overrideModel(id, modelApp);
    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isTrue(appearance!.equals(modelApp), "if elementId in alwaysDrawn set and overrides has Model corresponding to id, then appearance will be set to the ModelApp");

    overrides = new Overrides();
    appearance = FeatureSymbology.Appearance.fromJSON(props);
    modelApp = FeatureSymbology.Appearance.fromJSON(badModelProps);
    overrides.setAlwaysDrawn(elementId);
    overrides.overrideModel(id, modelApp);
    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isUndefined(appearance, "if appearance is set from model app and that app has an invalid transparency value, then getFeatureAppearance returns false");
    // NOTE: The above assertion appears to have assumed that getFeatureAppearance() returns undefined because it rejects the "invalid" transparency value.
    // In reality it detects that transparency is above the threshold considered "fully transparent" and therefore not visible.

    overrides = new Overrides();
    appearance = FeatureSymbology.Appearance.fromJSON(props);
    overrides.overrideElement(elementId, elemApp);
    overrides.setAlwaysDrawn(elementId);
    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isTrue(appearance!.equals(elemApp), "if elementId in alwaysDrawn set and overrides has Element corresponding to id but not Model nor SubCategory, then the app is set to the elemApp");

    overrides = new Overrides(viewState);
    appearance = FeatureSymbology.Appearance.fromJSON(props);
    overrides.setVisibleSubCategory(subCategoryId);
    overrides.overrideSubCategory(subCategoryId, subCatApp);
    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isTrue(appearance!.equals(subCatApp), "if subCategoryId is in visible set and SubCategoryApp is found, absent element or model apps, the result app is equal to the app extended by the subCategoryApp");

    overrides = new Overrides(viewState);
    appearance = FeatureSymbology.Appearance.fromJSON(props);
    modelApp = FeatureSymbology.Appearance.fromJSON(modelProps);
    overrides.overrideModel(id, modelApp);
    overrides.setVisibleSubCategory(subCategoryId);
    overrides.overrideSubCategory(subCategoryId, subCatApp);
    appearance = overrides.getFeatureAppearance(feature, id);
    let expected = subCatApp.extendAppearance(modelApp);
    assert.isTrue(appearance!.equals(expected), "if subCat and modelApp are found then the appearance is the extension of the subCatApp with the ModelApp");
    overrides = new Overrides(viewState);
    appearance = FeatureSymbology.Appearance.fromJSON(props);
    modelApp = FeatureSymbology.Appearance.fromJSON(modelProps);
    overrides.overrideModel(id, modelApp);
    overrides.overrideElement(elementId, elemApp);
    overrides.setVisibleSubCategory(subCategoryId);
    overrides.overrideSubCategory(subCategoryId, subCatApp);
    appearance = overrides.getFeatureAppearance(feature, id);
    expected = elemApp.extendAppearance(modelApp);
    expected = subCatApp.extendAppearance(expected);
    assert.isTrue(appearance!.equals(expected), "if subCat, elemApp, and modelApp are found then the appearance is the extension of all three");
  });

  it("overrideModel works as expected", () => {
    overrides = new Overrides();
    const id = Id64.fromString("0x111");
    const props1 = { rgb: new RgbColor(100, 100, 100), weight: 1, transparency: 100 / 255, linePixels: LinePixels.Solid, ignoresMaterial: true } as FeatureSymbology.AppearanceProps;
    const props2 = { ...props1, transparency: 200 / 255 } as FeatureSymbology.AppearanceProps;
    const modelApp1 = FeatureSymbology.Appearance.fromJSON(props1);
    const modelApp2 = FeatureSymbology.Appearance.fromJSON(props2);
    overrides.overrideModel(id, modelApp1);
    assert.exists(overrides.getModelOverridesById(id));

    overrides.overrideModel(id, modelApp2);
    assert.isTrue(overrides.getModelOverridesById(id)!.equals(modelApp2), "overrideModel will override prexisting model associated with given id if replaceExisting is not set to false explicitly");

    overrides.overrideModel(id, modelApp1, false);
    assert.isTrue(overrides.getModelOverridesById(id)!.equals(modelApp2), "overrides will not replace model if replace existing is set to false");

    overrides.overrideModel(id, modelApp1);
    assert.isTrue(overrides.getModelOverridesById(id)!.equals(modelApp1), "overrides will replace model if replace existing isn't set to false (test 2)");
  });

  it("overrideSubCategory works as expected", () => {
    overrides = new Overrides();
    const id = Id64.fromString("0x111");
    const props1 = { rgb: new RgbColor(100, 100, 100), weight: 1, transparency: 100 / 255, linePixels: LinePixels.Solid, ignoresMaterial: true } as FeatureSymbology.AppearanceProps;
    const props2 = { ...props1, transparency: 200 / 255 } as FeatureSymbology.AppearanceProps;
    const subCatApp1 = FeatureSymbology.Appearance.fromJSON(props1);
    const subCatApp2 = FeatureSymbology.Appearance.fromJSON(props2);

    overrides.overrideSubCategory(id, subCatApp1);
    assert.isUndefined(overrides.getSubCategoryOverridesById(id), "if subCategoryId not in subCategoryVisible set, then nothing is set");

    overrides.setVisibleSubCategory(id);
    overrides.overrideSubCategory(id, subCatApp2);
    assert.exists(overrides.getSubCategoryOverridesById(id), "if subCategoryId is in subCategoryVisible set, then subCategoryApp set");

    overrides.overrideSubCategory(id, subCatApp1, false);
    assert.isTrue(overrides.getSubCategoryOverridesById(id)!.equals(subCatApp2), "overrides will not replace subCatApp if replace existing is set to false");

    overrides.overrideSubCategory(id, subCatApp1);
    assert.isTrue(overrides.getSubCategoryOverridesById(id)!.equals(subCatApp1), "overrides will replace subCatApp if replace existing isn't set to false");
  });

  it("overrideElement works as expected", () => {
    overrides = new Overrides();
    const id = Id64.fromString("0x111");
    const props1 = { rgb: new RgbColor(100, 100, 100), weight: 1, transparency: 100 / 255, linePixels: LinePixels.Solid, ignoresMaterial: true } as FeatureSymbology.AppearanceProps;
    const props2 = { ...props1, transparency: 200 / 255 } as FeatureSymbology.AppearanceProps;
    const elemApp1 = FeatureSymbology.Appearance.fromJSON(props1);
    const elemApp2 = FeatureSymbology.Appearance.fromJSON(props2);

    overrides.setNeverDrawn(id);
    overrides.overrideElement(id, elemApp1);
    assert.isUndefined(overrides.getElementOverridesById(id), "if elementId is in never drawn set, then nothing is set");

    overrides = new Overrides();
    overrides.overrideElement(id, elemApp1);
    assert.exists(overrides.getElementOverridesById(id), "if elementId is not in never drawn set, then elemApp is set");

    overrides.overrideElement(id, elemApp2, false);
    assert.isTrue(overrides.getElementOverridesById(id)!.equals(elemApp1), "overrides will not replace elemApp if replace existing is set to false");

    overrides.overrideElement(id, elemApp2);
    assert.isTrue(overrides.getElementOverridesById(id)!.equals(elemApp2), "overrides will replace elemApp if replace existing isn't set to false");
  });

  it("setDefaultOverrides works as expected", () => {
    overrides = new Overrides();
    assert.isTrue(overrides.defaultOverrides.equals(FeatureSymbology.Appearance.fromJSON()), "initial default overrides are equivalent to default appearance instance");

    const props = { rgb: new RgbColor(100, 100, 100), weight: 1, transparency: 100 / 255, linePixels: LinePixels.Solid, ignoresMaterial: true } as FeatureSymbology.AppearanceProps;
    const app = FeatureSymbology.Appearance.fromJSON(props);
    overrides.setDefaultOverrides(app);
    assert.isTrue(overrides.defaultOverrides.equals(app), "default overrides can be overriden");
  });
});
