import React from "react";

import { BundleHost, bundleFromJson, type ProjectionView } from "@gik/react";

const BundleImport: ProjectionView = ({ emit }) => (
  <label className="gx-btn">
    Import JSON
    <input
      type="file"
      accept="application/json,.json"
      hidden
      onChange={async (event) => {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        emit("import", { name: file.name, text: await file.text() });
        event.currentTarget.value = "";
      }}
    />
  </label>
);

const BundlePreview: ProjectionView = ({ node }) => {
  const source = node.props.bundle;
  const result = React.useMemo(() => {
    try {
      return { bundle: bundleFromJson(source), error: "" };
    } catch (error) {
      return { bundle: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [source]);

  if (result.error || !result.bundle) {
    return <p className="gx-note gx-note-danger">{result.error || "No preview bundle available."}</p>;
  }

  return <BundleHost bundle={result.bundle} />;
};

const projectionViews: Record<string, ProjectionView> = {
  "bundle-import": BundleImport,
  "bundle-preview": BundlePreview,
};

export default projectionViews;
