import { describe, expect, test } from "vitest";

import { buildProviderCallInspectorDetail } from "../components/runtime/execution-inspector-model";
import { buildExecutionTimelineRows } from "../components/runtime/execution-timeline-model";
import {
  normalizeExecutionLogs,
  normalizeExecutionPayload,
  normalizeRuntimeHeatmap,
  normalizeRuntimeStory,
  normalizeRuntimeStoryListItem,
  normalizeTechnicalOperations,
  type ApiRuntimeStoryDetail,
} from "./runtime-api-model";

const normalStory: ApiRuntimeStoryDetail = {
  summary: {
    correlation_id: "corr_normal",
    created_at: "2026-06-01T12:00:00.000Z",
    duration: 500,
    error_count: 0,
    node_count: 2,
    pattern: ["function_run", "outbox_event"],
    services: ["identity", "outbox"],
    status: "completed",
    title: "CreateUser",
    updated_at: "2026-06-01T12:00:00.500Z",
  },
  nodes: [
    {
      duration_ms: 120,
      id: "fn_create_user",
      metadata: { attempts: 1, max_attempts: 3 },
      name: "identity.create_user",
      service: "identity",
      status: "completed",
      timestamp: "2026-06-01T12:00:00.000Z",
      type: "function_run",
    },
    {
      duration_ms: 80,
      id: "evt_user_registered",
      metadata: {
        attempts: 1,
        causation_id: "fn_create_user",
        max_attempts: 3,
      },
      display_name: "User Registered",
      name: "identity.user_registered.v1",
      service: "outbox",
      status: "published",
      timestamp: "2026-06-01T12:00:00.300Z",
      type: "outbox_event",
    },
  ],
  edges: [
    {
      id: "fn_create_user:evt_user_registered:causation",
      source: "fn_create_user",
      target: "evt_user_registered",
      type: "causation",
    },
  ],
  timeline_items: [
    {
      attempts: 1,
      completed_at: "2026-06-01T12:00:00.120Z",
      correlation_id: "corr_normal",
      created_at: "2026-06-01T12:00:00.000Z",
      id: "fn_create_user",
      max_attempts: 3,
      name: "identity.create_user",
      started_at: "2026-06-01T12:00:00.000Z",
      status: "completed",
      type: "function_run",
    },
  ],
};

describe("runtime API model normalization", () => {
  test("preserves backend story summary, nodes, edges, and timeline items", () => {
    const story = normalizeRuntimeStory(normalStory);

    expect(story).toMatchObject({
      correlationId: "corr_normal",
      durationMs: 500,
      id: "corr_normal",
      name: "CreateUser",
      status: "completed",
    });
    expect(story.nodes.map((node) => node.id)).toEqual([
      "fn_create_user",
      "evt_user_registered",
    ]);
    expect(story.nodes[1]).toMatchObject({
      canonicalName: "identity.user_registered.v1",
      name: "User Registered",
    });
    expect(story.edges).toEqual(normalStory.edges);
    expect(story.timelineItems?.map((item) => item.id)).toEqual([
      "fn_create_user",
    ]);
  });

  test("keeps backend-projected federated workflow, gaps, and reliability evidence", () => {
    const story = normalizeRuntimeStory({
      ...normalStory,
      summary: {
        ...normalStory.summary,
        correlation_id: "story_federated",
        story_kind: "federated",
      },
      nodes: [
        {
          duration_ms: 80,
          id: "evt_support_failed",
          metadata: { attempt: 3 },
          name: "support.ticket.escalation-requested.v1",
          service: "support-sla",
          status: "failed",
          timestamp: "2026-07-18T08:05:00.000Z",
          type: "outbox_event",
        },
      ],
      federation: {
        assembledAt: "2026-07-18T08:05:00.000Z",
        gaps: [
          {
            detectedAt: "2026-07-18T08:04:00.000Z",
            detail: "reader forbidden",
            kind: "unauthorized",
            lastObservedAt: "2026-07-18T08:05:00.000Z",
            nextAction: "refresh_story_segment_feed_authorization",
            sourceServiceId: "support-identity",
            tenantId: "tenant_a",
          },
        ],
        protocol: "lenso.federated-runtime-story.v1",
        reliability: [
          {
            observedAt: "2026-07-18T08:05:00.000Z",
            report: {
              activeDegradedModes: [
                {
                  dependencyId: "notification-gateway",
                  evidenceReferences: ["probe:notification-gateway"],
                  mode: "queue_notifications",
                },
              ],
              checks: [
                {
                  code: "workflow_backlog",
                  evidenceReferences: ["service-store:workflow"],
                  expected: { maximum: 5 },
                  issueCode: "workflow_backlog_limit_exceeded",
                  nextActions: ["drain_workflow_backlog"],
                  observed: 8,
                  state: "breached",
                },
              ],
              contractId: "support-reliability",
              contractVersion: "v1",
              effectiveValues: { workflowBacklogLimit: 5 },
              overrides: { workflowBacklogLimit: 5 },
              profile: "critical",
              protocol: "lenso.reliability-report.v1",
              serviceId: "support-sla",
              state: "degraded",
            },
            sourceServiceId: "support-sla",
            status: "available",
          },
        ],
        tenantId: "tenant_a",
        workflowEntities: [
          {
            attempt: 2,
            id: "compensation-1",
            instanceId: "workflow-1",
            kind: "compensation",
            label: "Compensation compensation-1",
            nodeId: "node-compensation",
            observedAt: "2026-07-18T08:05:00.000Z",
            serviceId: "support-sla",
            state: "intervention_required",
          },
        ],
      },
    });

    expect(story.source).toBe("federated-runtime-story");
    expect(story.nodes[0]).toMatchObject({
      id: "evt_support_failed",
      retryable: false,
      status: "failed",
    });
    expect(story.federation?.gaps[0]).toMatchObject({
      kind: "unauthorized",
      sourceServiceId: "support-identity",
    });
    expect(story.federation?.workflowEntities[0]).toMatchObject({
      kind: "compensation",
      state: "intervention_required",
    });
    expect(story.federation?.reliability[0]?.report).toMatchObject({
      overrides: { workflowBacklogLimit: 5 },
      profile: "critical",
      state: "degraded",
    });
  });

  test("canonicalizes legacy remote proxy story inputs at the API boundary", () => {
    const story = normalizeRuntimeStory({
      ...normalStory,
      nodes: [
        ...(normalStory.nodes ?? []),
        {
          duration_ms: 42,
          id: "remoteproxy_rproxy_1",
          metadata: {
            source_metadata: {
              declared_path: "/contacts/{id}",
              duration_ms: 42,
              error_code: null,
              error_details: [],
              method: "GET",
              module_name: "crm-service",
              path_params: { id: "contact_1" },
              remote_path: "/contacts/contact_1",
              remote_proxy_call_id: "rproxy_1",
              remote_status: 200,
              request_id: "req_service_proxy",
              retryable: false,
              span_id: "span_remote_proxy",
              trace_id: "trace_remote_proxy",
            },
          },
          name: "Fetch Contact",
          service: "crm-service",
          status: "completed",
          timestamp: "2026-06-01T12:00:00.180Z",
          type: "remote_proxy_call",
        },
        {
          duration_ms: 5,
          id: "fn_after_provider",
          metadata: {
            causation_id: "remoteproxy_rproxy_1",
          },
          name: "crm.after_provider",
          service: "crm-service",
          status: "completed",
          timestamp: "2026-06-01T12:00:00.225Z",
          type: "function_run",
        },
      ],
      edges: [
        ...(normalStory.edges ?? []),
        {
          id: "fn_create_user:remoteproxy_rproxy_1:causation",
          source: "fn_create_user",
          target: "remoteproxy_rproxy_1",
          type: "causation",
        },
        {
          id: "remoteproxy_rproxy_1:fn_after_provider:causation",
          source: "remoteproxy_rproxy_1",
          target: "fn_after_provider",
          type: "causation",
        },
      ],
      timeline_items: [
        ...(normalStory.timeline_items ?? []),
        {
          attempts: 1,
          completed_at: "2026-06-01T12:00:00.222Z",
          correlation_id: "corr_normal",
          created_at: "2026-06-01T12:00:00.180Z",
          id: "remoteproxy_rproxy_1",
          max_attempts: 1,
          name: "Fetch Contact",
          started_at: "2026-06-01T12:00:00.180Z",
          status: "completed",
          type: "remote_proxy_call",
        },
      ],
    });

    const providerNode = story.nodes.find(
      (node) => node.id === "provider_rproxy_1"
    );
    expect(providerNode).toMatchObject({
      durationMs: 42,
      kind: "external",
      name: "Fetch Contact",
      parentId: "fn_create_user",
      service: "crm-service",
      status: "completed",
    });
    expect(story.edges).toContainEqual({
      id: "fn_create_user:provider_rproxy_1:causation",
      source: "fn_create_user",
      target: "provider_rproxy_1",
      type: "causation",
    });
    expect(
      story.nodes.find((node) => node.id === "fn_after_provider")
    ).toMatchObject({
      context: { causation_id: "provider_rproxy_1" },
      parentId: "provider_rproxy_1",
    });
    expect(providerNode?.attributes.source_metadata).toMatchObject({
      declared_path: "/contacts/{id}",
      duration_ms: 42,
      error_details: [],
      method: "GET",
      module_name: "crm-service",
      path_params: { id: "contact_1" },
      provider_call_id: "rproxy_1",
      provider_path: "/contacts/contact_1",
      provider_status: 200,
      request_id: "req_service_proxy",
      retryable: false,
      span_id: "span_remote_proxy",
      trace_id: "trace_remote_proxy",
    });
    expect(providerNode?.attributes.source_metadata).not.toHaveProperty(
      "remote_proxy_call_id"
    );
    expect(
      buildExecutionTimelineRows(story).find(
        (row) => row.id === "provider_rproxy_1"
      )
    ).toMatchObject({
      metaParts: ["ok", "crm-service", "GET /contacts/{id}", "status 200"],
    });
    expect(buildProviderCallInspectorDetail(providerNode!)).toMatchObject({
      errorDetails: [],
      pathParams: { id: "contact_1" },
      rows: expect.arrayContaining([
        ["request id", "req_service_proxy"],
        ["trace id", "trace_remote_proxy"],
        ["span id", "span_remote_proxy"],
      ]),
    });
    expect(
      story.timelineItems?.find((item) => item.id === "provider_rproxy_1")
    ).toMatchObject({
      detailId: "provider_rproxy_1",
      name: "Fetch Contact",
      type: "provider_call",
    });
  });

  test("normalizes provider calls as canonical external story nodes", () => {
    const story = normalizeRuntimeStory({
      ...normalStory,
      nodes: [
        {
          duration_ms: 42,
          id: "provider_rproxy_1",
          metadata: {
            source_metadata: {
              declared_path: "/contacts/{id}",
              duration_ms: 42,
              method: "GET",
              module_name: "crm-service",
              provider_call_id: "rproxy_1",
              provider_path: "/contacts/contact_1",
              provider_status: 200,
              request_id: "req_provider",
            },
          },
          name: "Fetch Contact",
          service: "crm-service",
          status: "completed",
          timestamp: "2026-06-01T12:00:00.180Z",
          type: "provider_call",
        },
      ],
      edges: [],
      timeline_items: [
        {
          attempts: 1,
          completed_at: "2026-06-01T12:00:00.222Z",
          correlation_id: "corr_normal",
          created_at: "2026-06-01T12:00:00.180Z",
          id: "provider_rproxy_1",
          max_attempts: 1,
          name: "Fetch Contact",
          started_at: "2026-06-01T12:00:00.180Z",
          status: "completed",
          type: "provider_call",
        },
      ],
    });

    expect(story.nodes[0]).toMatchObject({
      id: "provider_rproxy_1",
      kind: "external",
    });
    expect(buildExecutionTimelineRows(story)[0]).toMatchObject({
      kind: "provider_call",
      metaParts: ["ok", "crm-service", "GET /contacts/{id}", "status 200"],
    });
  });

  test("normalizes fan-out story edges without collapsing siblings", () => {
    const story = normalizeRuntimeStory({
      ...normalStory,
      summary: {
        ...normalStory.summary,
        correlation_id: "corr_fanout",
        title: "Resource Published Fan-out",
      },
      nodes: [
        {
          duration_ms: 100,
          id: "event",
          metadata: {},
          name: "ResourceVersionPublished",
          service: "outbox",
          status: "published",
          timestamp: "2026-06-01T10:00:01.400Z",
          type: "outbox_event",
        },
        ...["search", "cdn", "notifications"].map((id, index) => ({
          duration_ms: 1000 + index,
          id,
          metadata: {},
          name: id,
          service: id,
          status: "completed",
          timestamp: `2026-06-01T10:00:02.${index}00Z`,
          type: "function_run",
        })),
      ],
      edges: [
        {
          id: "event:search",
          source: "event",
          target: "search",
          type: "causation",
        },
        { id: "event:cdn", source: "event", target: "cdn", type: "causation" },
        {
          id: "event:notifications",
          source: "event",
          target: "notifications",
          type: "causation",
        },
      ],
      timeline_items: [],
    });

    expect(
      story.edges
        ?.filter((edge) => edge.source === "event")
        .map((edge) => edge.target)
        .sort()
    ).toEqual(["cdn", "notifications", "search"]);
  });

  test("keeps failed and dead retry metadata usable", () => {
    const story = normalizeRuntimeStory({
      ...normalStory,
      summary: {
        ...normalStory.summary,
        correlation_id: "corr_failed",
        root_error: "connect ETIMEDOUT",
        status: "dead",
      },
      nodes: [
        {
          duration_ms: -20,
          error: "connect ETIMEDOUT",
          id: "dead_fn",
          metadata: { attempts: 3, max_attempts: 3 },
          name: "SendWelcomeEmail",
          service: "notifications",
          status: "dead",
          timestamp: "2026-06-01T12:00:00.000Z",
          type: "function_run",
        },
      ],
      edges: [],
      timeline_items: [],
    });

    expect(story.status).toBe("dead");
    expect(story.nodes[0]).toMatchObject({
      attempts: 3,
      durationMs: 0,
      maxAttempts: 3,
      retryable: true,
      status: "dead",
    });
    expect(story.nodes[0]?.logs).toEqual(["connect ETIMEDOUT"]);
  });

  test("handles an empty backend story detail", () => {
    const story = normalizeRuntimeStory({
      summary: {
        correlation_id: "corr_empty",
        created_at: "2026-06-01T12:00:00.000Z",
        duration: 0,
        error_count: 0,
        node_count: 0,
        pattern: [],
        services: [],
        status: "completed",
        title: "Empty Story",
        updated_at: "2026-06-01T12:00:00.000Z",
      },
      nodes: [],
      edges: [],
      timeline_items: [],
    });

    expect(story.nodes).toEqual([]);
    expect(story.edges).toEqual([]);
    expect(story.timelineItems).toEqual([]);
    expect(story.service).toBe("runtime");
  });

  test("repairs malformed but valid story data", () => {
    const story = normalizeRuntimeStory({
      summary: {
        correlation_id: "corr_malformed",
        created_at: "not-a-date",
        duration: -1,
        status: "mysterious",
        title: "",
      },
      nodes: [
        {
          id: "duplicate",
          metadata: null,
          name: "",
          service: "",
          status: "strange",
          timestamp: "not-a-date",
          type: "database_write",
        },
        {
          duration_ms: 10,
          id: "duplicate",
          metadata: { causation_id: "missing" },
          name: "Second",
          service: "worker",
          status: "running",
          timestamp: "2026-06-01T12:00:00.010Z",
          type: "worker",
        },
      ],
      edges: [
        {
          id: "orphan",
          source: "missing",
          target: "duplicate",
          type: "causation",
        },
      ],
    });

    expect(story.durationMs).toBe(10);
    expect(story.timestamp).toBe("1970-01-01T00:00:00.000Z");
    expect(story.status).toBe("pending");
    expect(story.nodes.map((node) => node.id)).toEqual([
      "duplicate",
      "duplicate__2",
    ]);
    expect(story.nodes[0]).toMatchObject({
      durationMs: 0,
      kind: "runtime",
      name: "Runtime Work",
      service: "runtime",
      status: "pending",
    });
    expect(story.edges).toEqual([]);
  });

  test("preserves disconnected components and drops only orphan edges", () => {
    const story = normalizeRuntimeStory({
      ...normalStory,
      summary: {
        ...normalStory.summary,
        correlation_id: "corr_disconnected",
      },
      nodes: [
        { ...normalStory.nodes![0]!, id: "component_a" },
        { ...normalStory.nodes![1]!, id: "component_b" },
        {
          duration_ms: 40,
          id: "component_c",
          metadata: {},
          name: "cleanup",
          service: "runtime",
          status: "completed",
          timestamp: "2026-06-01T12:00:01.000Z",
          type: "function_run",
        },
      ],
      edges: [
        {
          id: "valid",
          source: "component_a",
          target: "component_b",
          type: "sequence",
        },
        {
          id: "invalid",
          source: "component_b",
          target: "missing",
          type: "sequence",
        },
      ],
      timeline_items: [],
    });

    expect(story.nodes.map((node) => node.id)).toEqual([
      "component_a",
      "component_b",
      "component_c",
    ]);
    expect(story.edges).toEqual([
      {
        id: "valid",
        source: "component_a",
        target: "component_b",
        type: "sequence",
      },
    ]);
  });

  test("normalizes story list items without detail payloads", () => {
    const story = normalizeRuntimeStoryListItem({
      correlation_id: "corr_list",
      created_at: "2026-06-01T12:00:00.000Z",
      duration: 125,
      error_count: 1,
      node_count: 3,
      pattern: ["function_run"],
      root_error: "boom",
      services: ["runtime"],
      status: "failed",
      title: "Listed Story",
      updated_at: "2026-06-01T12:00:00.125Z",
    });

    expect(story).toMatchObject({
      correlationId: "corr_list",
      durationMs: 125,
      name: "Listed Story",
      status: "failed",
    });
    expect(story.nodes).toHaveLength(3);
    expect(story.nodes[0]?.kind).toBe("function");
  });

  test("normalizes backend heatmap cells defensively", () => {
    const heatmap = normalizeRuntimeHeatmap({
      bucket_seconds: -60,
      data: [
        {
          avg_duration_ms: -10,
          bucket_end: "bad",
          bucket_start: "2026-06-01T12:00:00.000Z",
          dead_count: -1,
          error_count: 2,
          max_duration_ms: 100,
          node_type: "database",
          service: "",
          total_count: -5,
        },
      ],
      page: { limit: 20, next_created_before: "2026-06-01T11:00:00.000Z" },
    });

    expect(heatmap.bucketSeconds).toBe(300);
    expect(heatmap.page).toEqual({
      limit: 20,
      nextCreatedBefore: "2026-06-01T11:00:00.000Z",
    });
    expect(heatmap.cells).toEqual([
      {
        bucketEnd: "2026-06-01T12:00:00.000Z",
        bucketStart: "2026-06-01T12:00:00.000Z",
        deadCount: 0,
        errorCount: 2,
        maxDurationMs: 100,
        nodeType: "function",
        service: "runtime",
        totalCount: 0,
      },
    ]);
  });

  test("normalizes provider heatmap cells as external work", () => {
    const heatmap = normalizeRuntimeHeatmap({
      bucket_seconds: 60,
      data: [
        {
          bucket_end: "2026-06-01T12:01:00.000Z",
          bucket_start: "2026-06-01T12:00:00.000Z",
          dead_count: 0,
          error_count: 1,
          node_type: "provider_call",
          service: "support/tickets",
          total_count: 1,
        },
      ],
    });

    expect(heatmap.cells[0]).toMatchObject({
      nodeType: "provider_call",
      service: "support/tickets",
    });
  });

  test("normalizes execution payload responses", () => {
    const payload = normalizeExecutionPayload({
      data: {
        groups: [
          {
            content: { user_id: "usr_1" },
            default_expanded: true,
            gaps: [],
            key: "input",
            redacted_fields: [],
          },
          {
            content: { status: 200 },
            default_expanded: false,
            gaps: [
              {
                detail: "The response body was not persisted.",
                field: "body",
                status: "not_captured",
              },
            ],
            key: "result",
            redacted_fields: ["result.email"],
          },
        ],
        input: { user_id: "usr_1" },
        metadata: { function_name: "notifications.send_welcome_email.v1" },
        node_type: "function",
        output: null,
        redacted_fields: ["input.email"],
      },
    });

    expect(payload).toEqual({
      groups: [
        {
          content: { user_id: "usr_1" },
          defaultExpanded: true,
          gaps: [],
          key: "input",
          redactedFields: [],
        },
        {
          content: { status: 200 },
          defaultExpanded: false,
          gaps: [
            {
              detail: "The response body was not persisted.",
              field: "body",
              status: "not_captured",
            },
          ],
          key: "result",
          redactedFields: ["result.email"],
        },
      ],
      input: { user_id: "usr_1" },
      metadata: { function_name: "notifications.send_welcome_email.v1" },
      nodeType: "function",
      output: null,
      redactedFields: ["input.email"],
    });
  });

  test("canonicalizes legacy remote proxy technical operations at the API boundary", () => {
    const operations = normalizeTechnicalOperations({
      data: [
        {
          attributes: {
            error_code: "external_dependency_failure",
            module_name: "crm-service",
            remote_path: "/contacts/contact_1",
            remote_proxy_call_id: "rproxy_1",
            remote_status: 502,
          },
          category: "external",
          correlation_id: "corr_1",
          duration_ms: 125,
          ended_at: "2026-06-01T12:00:01.125Z",
          id: "remote_proxy:rproxy_1",
          name: "Fetch Contact",
          related_node_id: null,
          source: "remote_proxy",
          started_at: "2026-06-01T12:00:01.000Z",
          status: "error",
          story_id: "corr_1",
        },
      ],
    });

    expect(operations[0]).toMatchObject({
      category: "external",
      attributes: {
        error_code: "external_dependency_failure",
        module_name: "crm-service",
        provider_call_id: "rproxy_1",
        provider_path: "/contacts/contact_1",
        provider_status: 502,
      },
      id: "provider:rproxy_1",
      source: "provider",
      status: "error",
    });
    expect(operations[0]?.attributes).not.toHaveProperty(
      "remote_proxy_call_id"
    );
  });

  test("preserves canonical provider technical operations", () => {
    const operations = normalizeTechnicalOperations({
      data: [
        {
          attributes: {
            provider_call_id: null,
            provider_path: "",
            provider_status: 0,
            remote_proxy_call_id: "legacy_rproxy_1",
            remote_path: "/legacy/contact_1",
            remote_status: 502,
          },
          category: "external",
          correlation_id: "corr_1",
          duration_ms: 125,
          ended_at: "2026-06-01T12:00:01.125Z",
          id: "provider:rproxy_1",
          name: "Fetch Contact",
          related_node_id: "provider_rproxy_1",
          source: "provider",
          started_at: "2026-06-01T12:00:01.000Z",
          status: "ok",
          story_id: "corr_1",
        },
      ],
    });

    expect(operations[0]).toMatchObject({
      attributes: {
        provider_call_id: null,
        provider_path: "",
        provider_status: 0,
      },
      id: "provider:rproxy_1",
      relatedNodeId: "provider_rproxy_1",
      source: "provider",
    });
    expect(operations[0]?.attributes).not.toHaveProperty(
      "remote_proxy_call_id"
    );
  });

  test("preserves remote runtime technical operation source", () => {
    const operations = normalizeTechnicalOperations({
      data: [
        {
          attributes: {
            function_name: "crm_service.sync_contact.v1",
            module_name: "crm-service",
          },
          category: "external",
          correlation_id: "corr_1",
          duration_ms: 42,
          ended_at: "2026-06-01T12:00:01.042Z",
          id: "remote_runtime:elog_1",
          name: "crm-service crm_service.sync_contact.v1",
          related_node_id: "fnrun_1",
          source: "remote_runtime",
          started_at: "2026-06-01T12:00:01.000Z",
          status: "ok",
          story_id: "corr_1",
        },
      ],
    });

    expect(operations[0]).toMatchObject({
      category: "external",
      id: "remote_runtime:elog_1",
      relatedNodeId: "fnrun_1",
      source: "remote_runtime",
      status: "ok",
    });
  });

  test("rejects technical operations from the retired administration source", () => {
    expect(
      normalizeTechnicalOperations({
        data: [
          {
            attributes: {},
            category: "admin",
            correlation_id: "corr_legacy",
            duration_ms: 1,
            ended_at: "2026-06-01T12:00:01.001Z",
            id: "legacy-admin-operation",
            name: "Retired operation",
            related_node_id: null,
            source: "admin_action",
            started_at: "2026-06-01T12:00:01.000Z",
            status: "ok",
            story_id: "corr_legacy",
          },
        ],
      })
    ).toEqual([]);
  });

  test("normalizes execution log responses", () => {
    const result = normalizeExecutionLogs({
      coverage: {
        gaps: [
          {
            detail: "support-api did not answer before the deadline",
            kind: "unreachable",
            next_action: "Check the Service connection",
            source_id: "support-api",
          },
        ],
        sources: [
          {
            service_name: "notifications",
            source_id: "local-runtime",
            status: "complete",
          },
          {
            service_name: "support-api",
            source_id: "support-api",
            status: "unavailable",
          },
        ],
        status: "partial",
      },
      data: [
        {
          attributes: { attempt: 1 },
          body: "Function run started",
          correlation_id: "corr_1",
          execution_name: "notifications.send_welcome_email.v1",
          id: "elog_1",
          node_id: "fnrun_1",
          node_type: "function_run",
          occurred_at: "2026-06-01T12:00:01.000Z",
          redacted_fields: ["attributes.email"],
          service_name: "notifications",
          severity: "info",
          span_id: "span_1",
          story_id: "corr_1",
          trace_id: "trace_1",
        },
      ],
    });

    expect(result).toEqual({
      coverage: {
        gaps: [
          {
            detail: "support-api did not answer before the deadline",
            kind: "unreachable",
            nextAction: "Check the Service connection",
            sourceId: "support-api",
          },
        ],
        sources: [
          {
            serviceName: "notifications",
            sourceId: "local-runtime",
            status: "complete",
          },
          {
            serviceName: "support-api",
            sourceId: "support-api",
            status: "unavailable",
          },
        ],
        status: "partial",
      },
      entries: [
        {
          attributes: { attempt: 1 },
          body: "Function run started",
          correlationId: "corr_1",
          executionName: "notifications.send_welcome_email.v1",
          id: "elog_1",
          nodeId: "fnrun_1",
          nodeType: "function_run",
          occurredAt: "2026-06-01T12:00:01.000Z",
          redactedFields: ["attributes.email"],
          serviceName: "notifications",
          severity: "info",
          spanId: "span_1",
          storyId: "corr_1",
          traceId: "trace_1",
        },
      ],
    });
  });

  test("keeps legacy execution log coverage unknown", () => {
    expect(normalizeExecutionLogs({ data: [] })).toEqual({ entries: [] });
  });

  test.each(["complete", "disabled", "partial", "unavailable"] as const)(
    "normalizes %s execution log coverage",
    (status) => {
      expect(
        normalizeExecutionLogs({
          coverage: { gaps: [], sources: [], status },
          data: [],
        }).coverage?.status
      ).toBe(status);
    }
  );

  test("treats an unrecognized execution log coverage status as unavailable", () => {
    expect(
      normalizeExecutionLogs({
        coverage: {
          gaps: [],
          sources: [],
          status: "future-state" as never,
        },
        data: [],
      }).coverage?.status
    ).toBe("unavailable");
  });
});
