use lenso_capability_ui_contribution::DescribeResponse;
use serde_json::{Value, json};

fn contribution() -> Value {
    json!({
        "workspace_id": "relay.console",
        "title": "Relay",
        "revision": "1",
        "module": "workspace.mjs",
        "styles": [],
        "navigation": {"label": "Relay", "items": []},
        "assets": [{
            "path": "workspace.mjs",
            "media_type": "text/javascript; charset=utf-8",
            "content_base64": "ZXhwb3J0IGNvbnN0IGFwaU1ham9yID0gMTs="
        }],
        "requirements": []
    })
}

#[test]
fn existing_wire_response_keeps_workspaces_absent() {
    let wire = contribution();
    let response: DescribeResponse = serde_json::from_value(wire.clone()).unwrap();
    assert!(response.workspaces.is_none());
    assert_eq!(serde_json::to_value(response).unwrap(), wire);
}

#[test]
fn workspace_paths_and_access_round_trip_independently_of_identity() {
    let mut wire = contribution();
    wire["workspaces"] = json!([
        {
            "id": "user",
            "title": "Relay",
            "path": "/console/",
            "index": [],
            "access": "member",
            "routes": [[], ["requests", "[id]"]],
            "navigation": {"label": "Relay", "items": []}
        },
        {
            "id": "administration",
            "title": "Relay administration",
            "path": "/admin/",
            "index": ["overview"],
            "access": "administrator",
            "routes": [["overview"]],
            "navigation": {"label": "Administration", "items": []},
            "requirements": []
        }
    ]);
    let response: DescribeResponse = serde_json::from_value(wire.clone()).unwrap();
    assert_eq!(response.workspace_id, "relay.console");
    assert_eq!(serde_json::to_value(response).unwrap(), wire);
    wire["workspaces"][1]["access"] = json!("owner");
    assert!(serde_json::from_value::<DescribeResponse>(wire).is_err());
}
