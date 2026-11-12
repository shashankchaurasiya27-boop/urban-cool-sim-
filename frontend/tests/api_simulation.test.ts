import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { api, validateSimulationResult, parseErrorResponse, type SimulationResult } from "../src/lib/api.ts";

describe("api.runPhysicsSimulation & Response Validation", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const validResponsePayload: SimulationResult = {
    id: "sim_test_123",
    scenario_id: "scen_hybrid_cp",
    baseline_t_mean: 42.5,
    scenario_t_mean: 39.1,
    delta_t_mean: 3.4,
    peak_t: 46.2,
    heat_risk_reduction: 51.0,
    energy_fluxes_json: {
      Q_star_mean: 620.0,
      Q_f_mean: 45.0,
      Q_h_mean: 310.0,
      Q_e_mean: 210.0,
      dQs_mean: 145.0,
    },
    spatial_summary: {
      min_t_c: 33.0,
      max_t_c: 46.2,
      p25_t_c: 38.0,
      p50_t_c: 40.5,
      p75_t_c: 43.1,
      max_cooling_c: 5.8,
      spatial_delta_map: [[3.4]],
      baseline_temp_map: [[42.5]],
      scenario_temp_map: [[39.1]],
    },
    provenance: {
      equation: "Q* + Qf = Qh + Qe + dQs",
      solver: "EnergyBalanceSolver",
      units: "°C, W/m²",
      synthetic_flag: false,
    },
  };

  it("1. Successfully returns validated simulation result when backend responds 200 OK", async () => {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      return new Response(JSON.stringify(validResponsePayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await api.runPhysicsSimulation("scen_hybrid_cp", undefined, "delhi_cp");
    assert.equal(result.id, "sim_test_123");
    assert.equal(result.scenario_id, "scen_hybrid_cp");
    assert.equal(result.baseline_t_mean, 42.5);
    assert.equal(result.scenario_t_mean, 39.1);
    assert.equal(result.delta_t_mean, 3.4);
  });

  it("2. Preserves optional compatibility fields (run_id, status, job_id) if present in response", async () => {
    const extendedPayload = {
      ...validResponsePayload,
      run_id: "run_777",
      status: "completed" as const,
      job_id: "job_999",
    };

    globalThis.fetch = async () => {
      return new Response(JSON.stringify(extendedPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await api.runPhysicsSimulation("scen_hybrid_cp", undefined, "delhi_cp");
    assert.equal(result.run_id, "run_777");
    assert.equal(result.status, "completed");
    assert.equal(result.job_id, "job_999");
  });

  it("3. Preserves valid zero-valued numeric parameters (solar_rad: 0, q_f: 0, air_temp: 0) without overriding with defaults", async () => {
    let capturedBody: any = null;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body) {
        capturedBody = JSON.parse(init.body as string);
      }
      return new Response(JSON.stringify(validResponsePayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await api.runPhysicsSimulation(
      "scen_zero_test",
      {
        air_temp: 0,
        solar_rad: 0,
        q_f: 0,
        rel_humidity: 0.5,
        wind_speed: 1.0,
      },
      "delhi_cp"
    );

    assert.ok(capturedBody !== null);
    assert.strictEqual(capturedBody.air_temperature_c, 0, "air_temp 0 must be preserved");
    assert.strictEqual(capturedBody.solar_radiation_wm2, 0, "solar_rad 0 must be preserved");
    assert.strictEqual(capturedBody.anthropogenic_heat_wm2, 0, "q_f 0 must be preserved");
    assert.strictEqual(capturedBody.relative_humidity, 0.5);
    assert.strictEqual(capturedBody.wind_speed_ms, 1.0);
  });

  it("4. Applies expected defaults when numeric parameters are undefined", async () => {
    let capturedBody: any = null;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body) {
        capturedBody = JSON.parse(init.body as string);
      }
      return new Response(JSON.stringify(validResponsePayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await api.runPhysicsSimulation("scen_default_test", {}, "delhi_cp");

    assert.ok(capturedBody !== null);
    assert.strictEqual(capturedBody.air_temperature_c, 42.0);
    assert.strictEqual(capturedBody.relative_humidity, 0.45);
    assert.strictEqual(capturedBody.wind_speed_ms, 2.5);
    assert.strictEqual(capturedBody.solar_radiation_wm2, 900.0);
    assert.strictEqual(capturedBody.anthropogenic_heat_wm2, 45.0);
  });

  it("5. URL-encodes the study area identifier in the query string", async () => {
    let requestedUrl = "";

    globalThis.fetch = async (input: RequestInfo | URL) => {
      requestedUrl = input.toString();
      return new Response(JSON.stringify(validResponsePayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const specialAreaId = "delhi core/zone#1 & test";
    await api.runPhysicsSimulation("scen_hybrid_cp", undefined, specialAreaId);

    const expectedEncoded = encodeURIComponent(specialAreaId);
    assert.ok(
      requestedUrl.includes(`study_area_id=${expectedEncoded}`),
      `Expected ${requestedUrl} to contain study_area_id=${expectedEncoded}`
    );
    assert.ok(!requestedUrl.includes("delhi core/zone#1 & test"), "Unencoded characters must not appear in query string");
  });

  it("6. Throws descriptive error containing backend string detail on HTTP 400/500", async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({ detail: "Unknown study area: invalid_area" }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      );
    };

    await assert.rejects(
      async () => {
        await api.runPhysicsSimulation("scen_hybrid_cp", undefined, "invalid_area");
      },
      (err: Error) => {
        assert.ok(err.message.includes("Unknown study area: invalid_area"));
        return true;
      }
    );
  });

  it("7. Throws descriptive error containing parsed FastAPI array detail on validation failure", async () => {
    globalThis.fetch = async () => {
      const pydanticError = {
        detail: [
          { loc: ["body", "solar_radiation_wm2"], msg: "Input should be greater than or equal to 0" },
          { loc: ["body", "wind_speed_ms"], msg: "Input should be greater than or equal to 0.1" },
        ],
      };
      return new Response(JSON.stringify(pydanticError), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      });
    };

    await assert.rejects(
      async () => {
        await api.runPhysicsSimulation("scen_hybrid_cp", undefined, "delhi_cp");
      },
      (err: Error) => {
        assert.ok(err.message.includes("solar_radiation_wm2: Input should be greater than or equal to 0"));
        assert.ok(err.message.includes("wind_speed_ms: Input should be greater than or equal to 0.1"));
        return true;
      }
    );
  });

  it("8. Falls back cleanly to generic status message on empty or unparseable non-2xx response", async () => {
    globalThis.fetch = async () => {
      return new Response("", { status: 503, statusText: "Service Unavailable" });
    };

    await assert.rejects(
      async () => {
        await api.runPhysicsSimulation("scen_hybrid_cp", undefined, "delhi_cp");
      },
      (err: Error) => {
        assert.ok(err.message.includes("503"));
        return true;
      }
    );
  });

  it("9. Propagates network errors without returning a fabricated success fallback", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch: Connection refused");
    };

    await assert.rejects(
      async () => {
        await api.runPhysicsSimulation("scen_hybrid_cp", undefined, "delhi_cp");
      },
      (err: Error) => {
        assert.ok(err instanceof TypeError);
        assert.ok(err.message.includes("Failed to fetch"));
        return true;
      }
    );
  });

  describe("validateSimulationResult", () => {
    it("10. Rejects non-object payloads", () => {
      assert.throws(() => validateSimulationResult(null), /response payload is not an object/);
      assert.throws(() => validateSimulationResult("string"), /response payload is not an object/);
      assert.throws(() => validateSimulationResult(123), /response payload is not an object/);
    });

    it("11. Rejects missing or empty 'id'", () => {
      assert.throws(
        () => validateSimulationResult({ ...validResponsePayload, id: "" }),
        /missing or invalid 'id'/
      );
      assert.throws(
        () => validateSimulationResult({ ...validResponsePayload, id: "   " }),
        /missing or invalid 'id'/
      );
      assert.throws(
        () => validateSimulationResult({ ...validResponsePayload, id: undefined }),
        /missing or invalid 'id'/
      );
    });

    it("12. Rejects missing or empty 'scenario_id'", () => {
      assert.throws(
        () => validateSimulationResult({ ...validResponsePayload, scenario_id: "" }),
        /missing or invalid 'scenario_id'/
      );
      assert.throws(
        () => validateSimulationResult({ ...validResponsePayload, scenario_id: undefined }),
        /missing or invalid 'scenario_id'/
      );
    });

    it("13. Rejects missing or non-numeric baseline_t_mean", () => {
      assert.throws(
        () => validateSimulationResult({ ...validResponsePayload, baseline_t_mean: "42.5" as any }),
        /'baseline_t_mean' must be a finite number/
      );
      assert.throws(
        () => validateSimulationResult({ ...validResponsePayload, baseline_t_mean: NaN }),
        /'baseline_t_mean' must be a finite number/
      );
      assert.throws(
        () => validateSimulationResult({ ...validResponsePayload, baseline_t_mean: Infinity }),
        /'baseline_t_mean' must be a finite number/
      );
    });

    it("14. Rejects missing or non-numeric delta_t_mean", () => {
      assert.throws(
        () => validateSimulationResult({ ...validResponsePayload, delta_t_mean: undefined as any }),
        /'delta_t_mean' must be a finite number/
      );
      assert.throws(
        () => validateSimulationResult({ ...validResponsePayload, delta_t_mean: null as any }),
        /'delta_t_mean' must be a finite number/
      );
    });

    it("15. Accepts valid payload without throwing", () => {
      assert.doesNotThrow(() => validateSimulationResult(validResponsePayload));
    });
  });

  describe("Simulation Run Retrieval & Report Integration", () => {
    it("16. Retrieves and validates a specific past simulation run via api.getSimulationRun", async () => {
      let requestedUrl = "";
      globalThis.fetch = async (input: RequestInfo | URL) => {
        requestedUrl = input.toString();
        return new Response(JSON.stringify({ ...validResponsePayload, id: "sim_abc123", run_id: "sim_abc123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      };

      const result = await api.getSimulationRun("sim_abc123");
      assert.equal(result.id, "sim_abc123");
      assert.equal(result.run_id, "sim_abc123");
      assert.ok(requestedUrl.includes("/thermal/runs/sim_abc123"));
    });

    it("17. Throws descriptive error when api.getSimulationRun encounters HTTP 404", async () => {
      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ detail: "Simulation run 'sim_not_found' not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      };

      await assert.rejects(
        async () => {
          await api.getSimulationRun("sim_not_found");
        },
        /Simulation run 'sim_not_found' not found/
      );
    });

    it("18. Lists and validates recent simulation runs via api.listSimulationRuns", async () => {
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify([
            { ...validResponsePayload, id: "sim_run_1", run_id: "sim_run_1" },
            { ...validResponsePayload, id: "sim_run_2", run_id: "sim_run_2" }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const runs = await api.listSimulationRuns("delhi_cp");
      assert.equal(runs.length, 2);
      assert.equal(runs[0].id, "sim_run_1");
      assert.equal(runs[1].id, "sim_run_2");
    });

    it("19. Binds report generation request to exact simulation_run_id via api.generateReport", async () => {
      let capturedBody: any = null;
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.body) {
          capturedBody = JSON.parse(init.body as string);
        }
        return new Response(
          JSON.stringify({
            id: "rep_123",
            title: "Test Report",
            summary: "Summary",
            markdown_content: "# Report",
            simulation_run_id: "sim_exact_456"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const rep = await api.generateReport("delhi_cp", "sim_exact_456");
      assert.ok(capturedBody !== null);
      assert.equal(capturedBody.simulation_run_id, "sim_exact_456");
      assert.equal(rep.simulation_run_id, "sim_exact_456");
    });
  });

  describe("C2 Spatial & GeoJSON Export Verification", () => {
    const dummySolution = {
      solution_id: 1,
      green_roof_pct: 35.0,
      cool_roof_pct: 25.0,
      tree_canopy_pct: 20.0,
      water_pct: 5.0,
      delta_t_mean: 3.42,
      total_cost_usd: 345000,
      water_demand_m3: 4200,
      land_area_m2: 250000,
      heat_risk_score: 1.8,
      physics_validated: true,
      validated_delta_t: 3.42,
      validation_error: 0.04
    };

    const studyAreaCoordinates: Record<string, { lat: number; lon: number }> = {
      delhi_cp: { lon: 77.2197, lat: 28.6328 },
      mumbai_bkc: { lon: 72.8679, lat: 19.0662 },
      singapore_marina: { lon: 103.8545, lat: 1.2838 },
      phoenix_downtown: { lon: -112.074, lat: 33.4484 },
      tokyo_shinjuku: { lon: 139.7003, lat: 35.6895 }
    };

    for (const [areaId, center] of Object.entries(studyAreaCoordinates)) {
      it(`20. Dynamically generates RFC 7946 GeoJSON centered on ${areaId} (no hardcoded Delhi geometry)`, () => {
        const geojson = api.generateInterventionsGeoJSON(dummySolution, areaId);

        assert.equal(geojson.type, "FeatureCollection");
        assert.equal(geojson.metadata?.study_area_id, areaId);
        assert.ok(geojson.metadata?.coordinate_reference_system.includes("OGC:CRS84 / WGS 84"));
        assert.ok(Array.isArray(geojson.features));
        assert.ok(geojson.features.length >= 3);

        // Verify that polygon coordinates are centered around the selected city's center (within 0.05 degrees)
        const polyFeature = geojson.features.find((f: any) => f.geometry.type === "Polygon");
        assert.ok(polyFeature, "Must have at least one Polygon feature");
        const ring = polyFeature.geometry.coordinates[0];
        assert.ok(ring.length >= 4, "Polygon ring must have at least 4 coordinates");

        // Verify ring closure
        assert.deepEqual(ring[0], ring[ring.length - 1], "Polygon ring must be closed");

        // Verify coordinates are strictly [longitude, latitude] in WGS 84
        for (const [lon, lat] of ring as [number, number][]) {
          assert.ok(lon >= -180 && lon <= 180, `Longitude ${lon} out of WGS 84 range`);
          assert.ok(lat >= -90 && lat <= 90, `Latitude ${lat} out of WGS 84 range`);
          assert.ok(Math.abs(lon - center.lon) < 0.05, `Longitude ${lon} not centered near ${areaId} (${center.lon})`);
          assert.ok(Math.abs(lat - center.lat) < 0.05, `Latitude ${lat} not centered near ${areaId} (${center.lat})`);
        }
      });
    }

    it("21. Preserves intervention solution properties in GeoJSON feature properties", () => {
      const geojson = api.generateInterventionsGeoJSON(dummySolution, "mumbai_bkc");
      const coolRoofFeature = geojson.features.find((f: any) => f.properties?.intervention === "Cool Roof Program");
      assert.ok(coolRoofFeature);
      assert.equal(coolRoofFeature.properties.albedo_delta, "+0.40");
      assert.equal(coolRoofFeature.properties.coverage_pct, 25.0);
    });
  });
});


