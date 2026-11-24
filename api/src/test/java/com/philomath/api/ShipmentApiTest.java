package com.philomath.api;

import com.jayway.jsonpath.JsonPath;
import com.philomath.api.store.ShipmentStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ShipmentApiTest {

    private static final String VALID_DATA = """
            {
              "reference": "SHP-1001",
              "recipient": "Ada Lovelace",
              "destination": "HK",
              "weightKg": 1.25,
              "priority": "NORMAL",
              "status": "DRAFT",
              "insured": true
            }
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ShipmentStore shipments;

    @BeforeEach
    void emptyStore() {
        shipments.clear();
    }

    @Test
    void createsReadsUpdatesAndDeletesAShipmentByPost() throws Exception {
        MvcResult created = mockMvc.perform(post("/api/shipments/createShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(call(VALID_DATA)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.userId").value("user-ada"))
                .andExpect(jsonPath("$.code").value("0"))
                .andExpect(jsonPath("$.message").value(""))
                .andExpect(jsonPath("$.exception").isEmpty())
                .andExpect(jsonPath("$.data.reference").value("SHP-1001"))
                .andExpect(jsonPath("$.data.destination").value("HK"))
                .andExpect(jsonPath("$.data.insured").value(true))
                .andReturn();
        Number id = JsonPath.read(created.getResponse().getContentAsString(), "$.data.id");

        mockMvc.perform(post("/api/shipments/getShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(call("{\"id\":" + id + "}")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("0"))
                .andExpect(jsonPath("$.data.recipient").value("Ada Lovelace"));

        mockMvc.perform(post("/api/shipments/queryShipments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(call("{\"nextCursor\":\"0\",\"size\":20,\"reference\":\"SHP\"}")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].id").value(id))
                .andExpect(jsonPath("$.data.totalSize").value(1))
                .andExpect(jsonPath("$.data.nextCursor").value("0"))
                .andExpect(jsonPath("$.data.totalElements").doesNotExist());

        String updated = VALID_DATA.replace("\"status\": \"DRAFT\"", "\"status\": \"BOOKED\"");
        mockMvc.perform(post("/api/shipments/updateShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(call(updated.replaceFirst("\\{", "{\"id\":" + id + ","))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("BOOKED"));

        mockMvc.perform(post("/api/shipments/deleteShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(call("{\"id\":" + id + "}")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("0"))
                .andExpect(jsonPath("$.data.id").value(id));

        mockMvc.perform(post("/api/shipments/getShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(call("{\"id\":" + id + "}")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ERR004"))
                .andExpect(jsonPath("$.message").value("Not found"))
                .andExpect(jsonPath("$.exception[0].type").value("E"))
                .andExpect(jsonPath("$.exception[0].code").value("ERR004"))
                .andExpect(jsonPath("$.exception[0].message").value("Not found: id"));
    }

    @Test
    void storesDateTimeAndNestedPackaging() throws Exception {
        mockMvc.perform(post("/api/shipments/createShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(call("""
                                {
                                  "reference": "SHP-2002",
                                  "recipient": "Ada Lovelace",
                                  "destination": "HK",
                                  "weightKg": 1.25,
                                  "priority": "NORMAL",
                                  "status": "DRAFT",
                                  "insured": true,
                                  "readyDate": "2026-03-01",
                                  "cutoffTime": "18:30:00",
                                  "bookedAt": "2026-03-01T10:15:30Z",
                                  "packaging": {
                                    "type": "BOX",
                                    "dimensions": { "lengthCm": 30, "widthCm": 20, "heightCm": 15 },
                                    "label": { "code": "LBL-2002", "carrier": "DHL" }
                                  }
                                }
                                """)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.readyDate").value("2026-03-01"))
                .andExpect(jsonPath("$.data.cutoffTime").value("18:30:00"))
                .andExpect(jsonPath("$.data.bookedAt").value("2026-03-01T10:15:30Z"))
                .andExpect(jsonPath("$.data.packaging.type").value("BOX"))
                .andExpect(jsonPath("$.data.packaging.dimensions.lengthCm").value(30.0))
                .andExpect(jsonPath("$.data.packaging.dimensions.widthCm").value(20.0))
                .andExpect(jsonPath("$.data.packaging.dimensions.heightCm").value(15.0))
                .andExpect(jsonPath("$.data.packaging.label.code").value("LBL-2002"))
                .andExpect(jsonPath("$.data.packaging.label.carrier").value("DHL"));
    }

    @Test
    void queryPagesWithHashedCursorAndPageSize() throws Exception {
        mockMvc.perform(post("/api/shipments/createShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(call(VALID_DATA)))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/shipments/createShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(call(VALID_DATA.replace("SHP-1001", "SHP-1002"))))
                .andExpect(status().isCreated());

        MvcResult first = mockMvc.perform(post("/api/shipments/queryShipments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(call("{\"nextCursor\":\"0\",\"size\":1}")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.totalSize").value(1))
                .andExpect(jsonPath("$.data.nextCursor").value(not("0")))
                .andReturn();
        String next = JsonPath.read(first.getResponse().getContentAsString(), "$.data.nextCursor");

        mockMvc.perform(post("/api/shipments/queryShipments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(call("{\"nextCursor\":\"" + next + "\",\"size\":1}")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.totalSize").value(1))
                .andExpect(jsonPath("$.data.nextCursor").value("0"));
    }

    @Test
    void queryFiltersByStatusAndReference() throws Exception {
        mockMvc.perform(post("/api/shipments/createShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(call(VALID_DATA)))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/shipments/createShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(call(VALID_DATA.replace("SHP-1001", "SHP-1002").replace("DRAFT", "BOOKED"))))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/shipments/createShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(call(VALID_DATA.replace("SHP-1001", "HK-2001").replace("DRAFT", "BOOKED"))))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/shipments/queryShipments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(call("{\"nextCursor\":\"0\",\"size\":20,\"status\":\"BOOKED\"}")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[*].status", hasItem("BOOKED")))
                .andExpect(jsonPath("$.data.content[*].status", not(hasItem("DRAFT"))));

        mockMvc.perform(post("/api/shipments/queryShipments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(call("{\"nextCursor\":\"0\",\"size\":20,\"reference\":\"SHP\",\"status\":\"BOOKED\"}")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].reference").value("SHP-1002"))
                .andExpect(jsonPath("$.data.content[0].status").value("BOOKED"));
    }

    @Test
    void reportsMissingAndInvalidFieldsInTheEnvelope() throws Exception {
        mockMvc.perform(post("/api/shipments/createShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "userId": "user-ada",
                                  "data": {
                                    "reference": "SHP-1001",
                                    "recipient": "Ada Lovelace",
                                    "destination": "HK",
                                    "weightKg": "heavy",
                                    "priority": "NORMAL",
                                    "status": "DRAFT",
                                    "insured": true
                                  }
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ERR002"))
                .andExpect(jsonPath("$.message").value("Schema validation error"))
                .andExpect(jsonPath("$.exception[0].type").value("E"))
                .andExpect(jsonPath("$.exception[0].code").value("ERR002"))
                .andExpect(jsonPath("$.exception[0].message").value("Invalid data type: weightKg"));

        mockMvc.perform(post("/api/shipments/createShipment")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "userId": "user-ada",
                                  "data": {
                                    "recipient": "Ada Lovelace",
                                    "destination": "HK",
                                    "weightKg": 1.25,
                                    "priority": "NORMAL",
                                    "status": "DRAFT",
                                    "insured": true
                                  }
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.userId").value("user-ada"))
                .andExpect(jsonPath("$.code").value("ERR001"))
                .andExpect(jsonPath("$.exception[0].message").value("Missing field: reference"));
    }

    @Test
    void publishesShipmentPostsInOpenApi() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/shipments/createShipment'].post.operationId").value("createShipment"))
                .andExpect(jsonPath("$.paths['/api/shipments/getShipment'].post.operationId").value("getShipment"))
                .andExpect(jsonPath("$.paths['/api/shipments/queryShipments'].post.operationId").value("queryShipments"))
                .andExpect(jsonPath("$.paths['/api/shipments/updateShipment'].post.operationId").value("updateShipment"))
                .andExpect(jsonPath("$.paths['/api/shipments/deleteShipment'].post.operationId").value("deleteShipment"))
                .andExpect(jsonPath("$.paths['/api/shipments/createShipment'].get").doesNotExist())
                .andExpect(jsonPath("$.components.schemas.ShipmentQuery.properties.nextCursor").exists())
                .andExpect(jsonPath("$.components.schemas.ShipmentQuery.properties.status").exists())
                .andExpect(jsonPath("$.components.schemas.ShipmentQuery.properties.page").doesNotExist())
                .andExpect(jsonPath("$.components.schemas.ShipmentPage.properties.totalSize").exists())
                .andExpect(jsonPath("$.components.schemas.ShipmentPage.properties.totalElements").doesNotExist())
                .andExpect(jsonPath("$.components.schemas.ShipmentRequest.properties.readyDate").exists())
                .andExpect(jsonPath("$.components.schemas.ShipmentRequest.properties.cutoffTime").exists())
                .andExpect(jsonPath("$.components.schemas.ShipmentRequest.properties.bookedAt").exists())
                .andExpect(jsonPath("$.components.schemas.ShipmentRequest.properties.packaging").exists())
                .andExpect(jsonPath("$.components.schemas.Packaging.properties.type").exists())
                .andExpect(jsonPath("$.components.schemas.Packaging.properties.dimensions").exists())
                .andExpect(jsonPath("$.components.schemas.Packaging.properties.label").exists())
                .andExpect(jsonPath("$.components.schemas.PackagingDimensions.properties.lengthCm").exists())
                .andExpect(jsonPath("$.components.schemas.PackagingLabel.properties.carrier").exists())
                .andExpect(jsonPath("$.components.schemas.CreateCall.properties.userId").exists())
                .andExpect(jsonPath("$.components.schemas.CreateCall.properties.data").exists())
                .andExpect(jsonPath("$.components.schemas.ItemReply.properties.code").exists())
                .andExpect(jsonPath("$.components.schemas.ItemReply.properties.exception").exists())
                .andExpect(jsonPath("$.components.schemas.ShipmentId.required", hasItem("id")));
    }

    private static String call(String data) {
        return "{\"userId\":\"user-ada\",\"data\":" + data + "}";
    }
}
