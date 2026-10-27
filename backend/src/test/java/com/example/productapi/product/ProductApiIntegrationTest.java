package com.example.productapi.product;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class ProductApiIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;

    @Test
    void productLifecycle() throws Exception {
        String body = "{\"name\":\"Headphones\",\"description\":\"Wireless\",\"price\":12.50}";
        String response = mvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andReturn().getResponse().getContentAsString();
        JsonNode product = mapper.readTree(response);
        String path = "/api/products/" + product.get("id").asLong();
        try {
            mvc.perform(get(path)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("Headphones"));
            mvc.perform(put(path).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"Updated\",\"description\":\"New\",\"price\":23.50}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("Updated"))
                    .andExpect(jsonPath("$.price").value(23.50));
            mvc.perform(get("/api/products")).andExpect(status().isOk())
                    .andExpect(jsonPath("$[?(@.id == " + product.get("id").asLong() + ")]").isNotEmpty());
        } finally {
            mvc.perform(delete(path)).andExpect(status().isNoContent());
        }
        mvc.perform(get(path)).andExpect(status().isNotFound());
        mvc.perform(put(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isNotFound());
        mvc.perform(delete(path)).andExpect(status().isNotFound());
    }

    @Test
    void rejectsInvalidProducts() throws Exception {
        String[] invalid = {
                "{\"name\":\" \",\"price\":1}",
                "{\"name\":\"Valid\",\"price\":-1}",
                "{\"name\":\"Valid\"}"
        };
        for (String body : invalid) {
            mvc.perform(post("/api/products").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest());
        }
    }
}
